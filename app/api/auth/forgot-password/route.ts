import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import { generateOTP } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { passwordResetEmail, sendMailNow } from "@/lib/send-mail";
import {
    EMAIL_PATTERN,
    normalizeEmail,
    OTP_TTL_MS,
    RESEND_COOLDOWN_MS,
} from "@/lib/email-verification";

/**
 * Step 1 of a password reset: mail a single-use code.
 *
 * The response is deliberately the same whether or not the address is
 * registered — otherwise this endpoint becomes a way to test which email
 * addresses have accounts. `emailSent` is the one honest signal the client gets,
 * and for an unknown address it reports true so the app walks the same path it
 * would for a real one.
 *
 * The code is never echoed in the response, in any environment.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const body = await req.json();
        const email = normalizeEmail(body?.email);

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        if (!EMAIL_PATTERN.test(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address" },
                { status: 400 }
            );
        }

        const genericResponse = {
            message:
                "If an account exists for that email address, a 6-digit reset code is on its way.",
            email,
        };

        const user = await User.findOne({ email }).select(
            "+passwordResetOTP +passwordResetOTPExpiry +passwordResetAttempts +passwordResetLastSentAt"
        );

        // No account: claim success and stop. The caller cannot tell this apart
        // from the happy path, which is the point.
        if (!user) {
            return NextResponse.json({ ...genericResponse, emailSent: true }, { status: 200 });
        }

        // Throttle so the endpoint can't be used to flood someone's inbox — and
        // so a double-tap on "send" doesn't rotate the code out from under a
        // message that has already been delivered.
        if (user.passwordResetLastSentAt) {
            const elapsed = Date.now() - user.passwordResetLastSentAt.getTime();
            if (elapsed < RESEND_COOLDOWN_MS) {
                const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
                return NextResponse.json(
                    {
                        error: `A code was just sent. Please wait ${retryAfter}s before requesting another.`,
                        retryAfter,
                    },
                    { status: 429 }
                );
            }
        }

        const otp = generateOTP();
        user.passwordResetOTP = otp;
        user.passwordResetOTPExpiry = new Date(Date.now() + OTP_TTL_MS);
        user.passwordResetAttempts = 0;
        user.passwordResetLastSentAt = new Date();
        await user.save();

        try {
            await sendMailNow({ to: user.email, ...passwordResetEmail(user.name, otp) });
        } catch (emailErr) {
            console.error("[forgot-password] failed to send reset email:", emailErr);

            // Returning 200-with-success here is what made this feature look
            // broken: the app moved on to "enter the code" for a mail that never
            // left the building. Report the failure, and clear the cooldown so
            // the retry isn't also blocked.
            user.passwordResetLastSentAt = undefined;
            await user.save();

            return NextResponse.json(
                {
                    ...genericResponse,
                    emailSent: false,
                    error: "We could not send the reset email just now. Please check the address and try again in a moment.",
                },
                { status: 200 }
            );
        }

        return NextResponse.json(
            {
                ...genericResponse,
                emailSent: true,
                expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
                resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/forgot-password");
    }
}
