import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import { generateOTP } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { otpEmail, sendMailNow } from "@/lib/send-mail";

const OTP_TTL_MS = 15 * 60 * 1000;

/**
 * Public staff sign-up.
 *
 * Self-registration ALWAYS creates a pending staff account. The role is never
 * read from the request body: doing so previously let anyone POST
 * `{"role":"admin"}` and mint an auto-approved administrator, bypassing manager
 * approval entirely. Managers and admins are provisioned by the seed script or
 * promoted by an existing admin, never through this endpoint.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const { name, email, password, phone, department } = await req.json();

        if (!name || !email || !password) {
            return NextResponse.json(
                { error: "Name, email, and password are required" },
                { status: 400 }
            );
        }

        if (typeof password !== "string" || password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 }
            );
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return NextResponse.json(
                { error: "Please enter a valid email address" },
                { status: 400 }
            );
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
        const hashedPassword = await bcrypt.hash(password, 10);

        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            // An account that never completed verification isn't a real account
            // yet, so let the person start over instead of locking them out with
            // "email already exists" and no way to get a fresh code.
            if (existingUser.isEmailVerified) {
                return NextResponse.json(
                    { error: "An account with this email already exists. Please log in instead." },
                    { status: 409 }
                );
            }

            existingUser.name = name;
            existingUser.password = hashedPassword;
            existingUser.phone = phone;
            existingUser.department = department;
            existingUser.emailOTP = otp;
            existingUser.emailOTPExpiry = otpExpiry;
            await existingUser.save();
        } else {
            await User.create({
                name,
                email: normalizedEmail,
                password: hashedPassword,
                phone,
                department,
                role: "staff",
                isEmailVerified: false,
                approvalStatus: "pending",
                emailOTP: otp,
                emailOTPExpiry: otpExpiry,
            });
        }

        // The OTP is the one email the user is genuinely blocked on, so this one
        // is awaited — a silent failure here would strand them on the verify
        // screen with no code and no explanation.
        let emailSent = true;
        try {
            await sendMailNow({ to: normalizedEmail, ...otpEmail(name, otp) });
        } catch (emailErr) {
            emailSent = false;
            console.error("[register] failed to send OTP email:", emailErr);
        }

        return NextResponse.json(
            {
                message: emailSent
                    ? "Registration successful. Please verify your email with the code we just sent."
                    : "Account created, but we could not send the verification email. Please use 'Resend code' or contact the administrator.",
                emailSent,
                email: normalizedEmail,
                // Dev convenience only: lets you test the flow without SMTP set
                // up. Never returned in production builds.
                otp: process.env.NODE_ENV === "production" ? undefined : otp,
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        return errorResponse(
            error,
            "auth/register",
            "An account with this email already exists."
        );
    }
}
