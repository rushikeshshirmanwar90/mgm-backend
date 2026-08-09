import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import EmailVerification from "@/models/EmailVerification";
import { errorResponse } from "@/lib/api-helpers";
import {
    CHALLENGE_TTL_MS,
    generateVerificationToken,
    MAX_OTP_ATTEMPTS,
    normalizeEmail,
    safeEqual,
    VERIFICATION_TOKEN_TTL_MS,
} from "@/lib/email-verification";

/**
 * Step 2 of sign-up: check the code and hand back proof of ownership.
 *
 * On success the caller gets a single-use `verificationToken` which
 * `POST /auth/register` requires. Without that token the register endpoint
 * refuses to create an account, so the address on a new account is always one
 * whose inbox the registrant demonstrably reached.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const body = await req.json();
        const email = normalizeEmail(body?.email);
        const otp = String(body?.otp ?? "").trim();

        if (!email || !otp) {
            return NextResponse.json(
                { error: "Email and verification code are required" },
                { status: 400 }
            );
        }

        // Both secrets are `select: false`, so they have to be pulled in
        // explicitly — assigning to a path that was never loaded won't persist.
        const record = await EmailVerification.findOne({ email }).select(
            "+otp +verificationToken"
        );

        if (!record || !record.otp || !record.otpExpiry) {
            return NextResponse.json(
                { error: "No verification code was requested for this email. Please send a code first." },
                { status: 400 }
            );
        }

        // Expiry is checked before the code itself, so a stale code reports
        // "expired" rather than the misleading "invalid".
        if (new Date() > record.otpExpiry) {
            return NextResponse.json(
                { error: "This verification code has expired. Please request a new one." },
                { status: 400 }
            );
        }

        // Six digits is only a million possibilities — without a cap, a script
        // could walk the whole space inside the 15-minute window.
        if (record.attempts >= MAX_OTP_ATTEMPTS) {
            return NextResponse.json(
                { error: "Too many incorrect attempts. Please request a new code." },
                { status: 429 }
            );
        }

        if (!safeEqual(record.otp, otp)) {
            record.attempts += 1;
            await record.save();

            const remaining = Math.max(MAX_OTP_ATTEMPTS - record.attempts, 0);
            return NextResponse.json(
                {
                    error: remaining
                        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
                        : "Too many incorrect attempts. Please request a new code.",
                    attemptsRemaining: remaining,
                },
                { status: 400 }
            );
        }

        const verificationToken = generateVerificationToken();
        const now = Date.now();

        // The code is consumed here so it can't be replayed for a second token.
        record.otp = undefined;
        record.otpExpiry = undefined;
        record.attempts = 0;
        record.verified = true;
        record.verificationToken = verificationToken;
        record.tokenExpiry = new Date(now + VERIFICATION_TOKEN_TTL_MS);
        record.expiresAt = new Date(now + CHALLENGE_TTL_MS);
        await record.save();

        return NextResponse.json(
            {
                message: "Email verified. You can now finish creating your account.",
                verified: true,
                email,
                verificationToken,
                expiresInSeconds: Math.floor(VERIFICATION_TOKEN_TTL_MS / 1000),
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/email-otp/verify");
    }
}
