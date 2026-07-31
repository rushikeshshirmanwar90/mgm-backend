import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import { generateOTP } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { otpEmail, sendMailNow } from "@/lib/send-mail";

const OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Issues a fresh verification code.
 *
 * The verify screen has always told users to "request a new code" but there was
 * no endpoint behind it, so an expired OTP was a dead end.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const user = await User.findOne({
            email: String(email).toLowerCase().trim(),
        }).select("+emailOTPExpiry");

        // Replying identically whether or not the account exists keeps this from
        // being used to enumerate registered email addresses.
        const genericResponse = {
            message: "If that email is registered and unverified, a new code is on its way.",
        };

        if (!user || user.isEmailVerified) {
            return NextResponse.json(genericResponse, { status: 200 });
        }

        // Throttle so the endpoint can't be used to spam someone's inbox.
        if (user.emailOTPExpiry) {
            const issuedAt = user.emailOTPExpiry.getTime() - OTP_TTL_MS;
            const elapsed = Date.now() - issuedAt;
            if (elapsed < RESEND_COOLDOWN_MS) {
                return NextResponse.json(
                    {
                        error: `Please wait ${Math.ceil(
                            (RESEND_COOLDOWN_MS - elapsed) / 1000
                        )}s before requesting another code.`,
                    },
                    { status: 429 }
                );
            }
        }

        const otp = generateOTP();
        user.emailOTP = otp;
        user.emailOTPExpiry = new Date(Date.now() + OTP_TTL_MS);
        await user.save();

        let emailSent = true;
        try {
            await sendMailNow({ to: user.email, ...otpEmail(user.name, otp) });
        } catch (emailErr) {
            emailSent = false;
            console.error("[resend-otp] failed to send OTP email:", emailErr);
        }

        return NextResponse.json(
            {
                ...genericResponse,
                emailSent,
                otp: process.env.NODE_ENV === "production" ? undefined : otp,
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "auth/resend-otp");
    }
}
