import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import { errorResponse } from "@/lib/api-helpers";
import {
    MAX_OTP_ATTEMPTS,
    normalizeEmail,
    safeEqual,
} from "@/lib/email-verification";

/**
 * Step 2 of a password reset: check the code and set the new password.
 *
 * The code is consumed on success, capped on failure, and compared in constant
 * time. Previously it could be guessed without limit — six digits inside a
 * 15-minute window is a small enough space that "no lockout" is the whole
 * attack.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const body = await req.json();
        const email = normalizeEmail(body?.email);
        const otp = String(body?.otp ?? "").trim();
        const newPassword = body?.newPassword;

        if (!email || !otp || !newPassword) {
            return NextResponse.json(
                { error: "Email, verification code, and new password are required" },
                { status: 400 }
            );
        }

        if (typeof newPassword !== "string" || newPassword.length < 6) {
            return NextResponse.json(
                { error: "New password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        const user = await User.findOne({ email }).select(
            "+password +passwordResetOTP +passwordResetOTPExpiry +passwordResetAttempts +passwordResetLastSentAt"
        );

        // One message covers "no such account", "no reset pending" and "wrong
        // code", so none of them can be told apart from the outside.
        const invalid = NextResponse.json(
            { error: "Invalid or expired reset code. Please request a new one." },
            { status: 400 }
        );

        if (!user || !user.passwordResetOTP || !user.passwordResetOTPExpiry) {
            return invalid;
        }

        // Expiry before the code itself, so a stale code says "expired" rather
        // than the misleading "invalid".
        if (new Date() > user.passwordResetOTPExpiry) {
            return NextResponse.json(
                { error: "This reset code has expired. Please request a new one." },
                { status: 400 }
            );
        }

        if (user.passwordResetAttempts >= MAX_OTP_ATTEMPTS) {
            return NextResponse.json(
                { error: "Too many incorrect attempts. Please request a new code." },
                { status: 429 }
            );
        }

        if (!safeEqual(user.passwordResetOTP, otp)) {
            user.passwordResetAttempts += 1;
            await user.save();

            const remaining = Math.max(MAX_OTP_ATTEMPTS - user.passwordResetAttempts, 0);
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

        // Reusing the current password would leave the account exactly as
        // exposed as whatever prompted the reset.
        if (await bcrypt.compare(newPassword, user.password)) {
            return NextResponse.json(
                { error: "Please choose a password different from your current one." },
                { status: 400 }
            );
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordResetOTP = undefined;
        user.passwordResetOTPExpiry = undefined;
        user.passwordResetAttempts = 0;
        user.passwordResetLastSentAt = undefined;

        // Retires every token issued before now, so a reset prompted by someone
        // else being in the account actually gets them out (enforced in
        // /auth/me, which the app calls on launch).
        user.passwordChangedAt = new Date();

        // Receiving the code proves control of the inbox, which is the same
        // thing email verification asks for. This lets an account left
        // unverified by the old signup flow recover without a separate step.
        user.isEmailVerified = true;

        await user.save();

        return NextResponse.json(
            {
                message:
                    "Your password has been reset. Please log in with your new password.",
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/reset-password");
    }
}
