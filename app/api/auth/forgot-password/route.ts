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

        // In production, keep generic response so email addresses cannot be enumerated.
        // In development, warn the developer so they don't wait for a ghost email.
        if (!user) {
            console.warn(`[forgot-password] Account not found for email: ${email}`);
            if (process.env.NODE_ENV !== "production") {
                return NextResponse.json(
                    {
                        error: `No account exists with email "${email}". Please enter a registered email.`,
                        emailSent: false,
                    },
                    { status: 404 }
                );
            }
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

        console.log("\n=======================================================");
        console.log(`🔑 [PASSWORD RESET OTP]`);
        console.log(`   User: ${user.name} (${user.email})`);
        console.log(`   OTP Code: ${otp}`);
        console.log("=======================================================\n");

        let emailSent = true;
        try {
            await sendMailNow({ to: user.email, ...passwordResetEmail(user.name, otp) });
        } catch (emailErr) {
            console.error("[forgot-password] failed to send reset email via SMTP:", emailErr);
            emailSent = false;

            // In production, if email genuinely failed to go out, report failure and clear cooldown
            if (process.env.NODE_ENV === "production") {
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
        }

        return NextResponse.json(
            {
                ...genericResponse,
                emailSent: true,
                expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
                resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
                ...(process.env.NODE_ENV !== "production" ? { devOtp: otp } : {}),
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/forgot-password");
    }
}
