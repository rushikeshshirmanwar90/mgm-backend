import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import EmailVerification from "@/models/EmailVerification";
import { generateOTP } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { otpEmail, sendMailNow } from "@/lib/send-mail";
import {
    CHALLENGE_TTL_MS,
    EMAIL_PATTERN,
    normalizeEmail,
    OTP_TTL_MS,
    RESEND_COOLDOWN_MS,
} from "@/lib/email-verification";

/**
 * Step 1 of sign-up: mail a verification code to the address being registered.
 *
 * This runs from the registration form itself, before any account exists — the
 * challenge lives in its own collection (see models/EmailVerification) and is
 * traded for a one-shot token in step 2. Nothing is written to the User
 * collection here, so an abandoned sign-up leaves no half-made account behind.
 *
 * The code is only ever delivered by email. It is never echoed in the response,
 * in any environment.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const body = await req.json();
        const email = normalizeEmail(body?.email);
        const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "there";

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        if (!EMAIL_PATTERN.test(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address" },
                { status: 400 }
            );
        }

        // Say so now rather than letting someone type a whole form, verify an
        // address they already own an account for, and only then be rejected.
        const existingUser = await User.findOne({ email });
        if (existingUser?.isEmailVerified) {
            return NextResponse.json(
                { error: "An account with this email already exists. Please log in instead." },
                { status: 409 }
            );
        }

        const now = Date.now();
        const record = await EmailVerification.findOne({ email });

        // Throttle so this can't be used to flood someone's inbox.
        if (record?.lastSentAt) {
            const elapsed = now - record.lastSentAt.getTime();
            if (elapsed < RESEND_COOLDOWN_MS) {
                const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
                return NextResponse.json(
                    {
                        error: `Please wait ${retryAfter}s before requesting another code.`,
                        retryAfter,
                    },
                    { status: 429 }
                );
            }
        }

        const otp = generateOTP();

        // Issuing a new code invalidates everything the previous one earned —
        // otherwise a token from an earlier round would survive the reset.
        await EmailVerification.findOneAndUpdate(
            { email },
            {
                $set: {
                    email,
                    otp,
                    otpExpiry: new Date(now + OTP_TTL_MS),
                    attempts: 0,
                    verified: false,
                    lastSentAt: new Date(now),
                    expiresAt: new Date(now + CHALLENGE_TTL_MS),
                },
                $unset: { verificationToken: "", tokenExpiry: "" },
            },
            { upsert: true, new: true }
        );

        try {
            await sendMailNow({ to: email, ...otpEmail(name, otp) });
        } catch (emailErr) {
            console.error("[auth/email-otp/send] failed to send OTP email:", emailErr);
            // The send failed, so the cooldown shouldn't punish the retry. Clear
            // lastSentAt and let them try again immediately.
            await EmailVerification.updateOne({ email }, { $unset: { lastSentAt: "" } });
            return NextResponse.json(
                {
                    error: "We could not send the verification email. Please check the address and try again, or contact the administrator.",
                },
                { status: 502 }
            );
        }

        return NextResponse.json(
            {
                message: `We sent a 6-digit verification code to ${email}. It is valid for 15 minutes.`,
                email,
                expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
                resendInSeconds: Math.floor(RESEND_COOLDOWN_MS / 1000),
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/email-otp/send");
    }
}
