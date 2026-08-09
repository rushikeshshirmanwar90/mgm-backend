import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import EmailVerification from "@/models/EmailVerification";
import { errorResponse } from "@/lib/api-helpers";
import { EMAIL_PATTERN, normalizeEmail, safeEqual } from "@/lib/email-verification";

/**
 * Public staff sign-up — step 3, and the last one.
 *
 * Email ownership is proved *before* this point, on the registration form
 * itself: the client sends a code via `/auth/email-otp/send`, exchanges it for a
 * `verificationToken` via `/auth/email-otp/verify`, and presents that token
 * here. This endpoint refuses to create an account without a valid one, so an
 * account is never created for an unproven address and there is no post-signup
 * verification step left to strand anyone on.
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
        const { name, email, password, phone, department, verificationToken } = await req.json();

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

        const normalizedEmail = normalizeEmail(email);
        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            return NextResponse.json(
                { error: "Please enter a valid email address" },
                { status: 400 }
            );
        }

        // `verificationRequired` lets the app reset its verification UI and send
        // a fresh code, rather than making the user guess what went wrong.
        if (typeof verificationToken !== "string" || !verificationToken) {
            return NextResponse.json(
                {
                    error: "Please verify your email address before creating your account.",
                    verificationRequired: true,
                },
                { status: 400 }
            );
        }

        const challenge = await EmailVerification.findOne({ email: normalizedEmail }).select(
            "+verificationToken"
        );

        if (!challenge?.verified || !safeEqual(challenge.verificationToken, verificationToken)) {
            return NextResponse.json(
                {
                    error: "This email has not been verified. Please request a new code and verify it.",
                    verificationRequired: true,
                },
                { status: 400 }
            );
        }

        if (!challenge.tokenExpiry || new Date() > challenge.tokenExpiry) {
            return NextResponse.json(
                {
                    error: "Your email verification has expired. Please verify your email again.",
                    verificationRequired: true,
                },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        // emailOTP/emailOTPExpiry are `select: false`; they're pulled in so the
        // legacy-account branch below can actually clear them.
        const existingUser = await User.findOne({ email: normalizedEmail }).select(
            "+emailOTP +emailOTPExpiry"
        );

        if (existingUser?.isEmailVerified) {
            return NextResponse.json(
                { error: "An account with this email already exists. Please log in instead." },
                { status: 409 }
            );
        }

        if (existingUser) {
            // A leftover unverified account from the old flow (or from a legacy
            // client) isn't a real account yet. The registrant has just proved
            // they own the address, so let them claim it instead of being locked
            // out by "email already exists".
            existingUser.name = name;
            existingUser.password = hashedPassword;
            existingUser.phone = phone;
            existingUser.department = department;
            existingUser.isEmailVerified = true;
            existingUser.emailOTP = undefined;
            existingUser.emailOTPExpiry = undefined;
            await existingUser.save();
        } else {
            await User.create({
                name,
                email: normalizedEmail,
                password: hashedPassword,
                phone,
                department,
                role: "staff",
                isEmailVerified: true,
                approvalStatus: "pending",
            });
        }

        // The challenge has done its job — drop it so the token is strictly
        // single-use and can't create a second account.
        await EmailVerification.deleteOne({ email: normalizedEmail });

        return NextResponse.json(
            {
                message:
                    "Account created and email verified. The Estate Manager will review your registration before you can log in.",
                email: normalizedEmail,
                requiresApproval: true,
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
