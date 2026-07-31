import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
    try {
        await connect();
        const { email, otp } = await req.json();

        if (!email || !otp) {
            return NextResponse.json(
                { error: "Email and OTP are required" },
                { status: 400 }
            );
        }

        // emailOTP/emailOTPExpiry are `select: false` on the schema so they never
        // leak through ordinary reads; this is the one place they're needed.
        const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
            "+emailOTP +emailOTPExpiry"
        );

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (user.isEmailVerified) {
            return NextResponse.json(
                { message: "Email is already verified", isApproved: user.isApproved },
                { status: 200 }
            );
        }

        // Expiry is checked before the code itself, so a stale code reports
        // "expired" rather than the misleading "invalid".
        if (!user.emailOTP || !user.emailOTPExpiry || new Date() > user.emailOTPExpiry) {
            return NextResponse.json(
                { error: "Verification code has expired. Please request a new code." },
                { status: 400 }
            );
        }

        if (user.emailOTP !== String(otp).trim()) {
            return NextResponse.json(
                { error: "Invalid verification code" },
                { status: 400 }
            );
        }

        user.isEmailVerified = true;
        user.emailOTP = undefined;
        user.emailOTPExpiry = undefined;
        await user.save();

        return NextResponse.json(
            {
                message:
                    "Email verified successfully! Your account is now awaiting manager approval.",
                isApproved: user.isApproved,
                approvalStatus: user.approvalStatus,
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/verify-email");
    }
}
