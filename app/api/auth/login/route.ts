import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import { generateToken } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
    try {
        await connect();
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 }
            );
        }

        const user = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (!user) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        if (!user.isEmailVerified) {
            return NextResponse.json(
                {
                    error: "Email not verified. Please verify your email before logging in.",
                    isEmailVerified: false,
                    email: user.email,
                },
                { status: 403 }
            );
        }

        // Staff need an explicit approval; managers and admins are provisioned
        // directly and are approved at creation time.
        if (user.role === "staff" && !user.isApproved) {
            return NextResponse.json(
                {
                    error:
                        user.approvalStatus === "rejected"
                            ? "Your registration was not approved. Please contact the Estate Manager's office."
                            : "Your registration is pending manager approval. You'll be notified by email once it's reviewed.",
                    isApproved: false,
                    approvalStatus: user.approvalStatus,
                },
                { status: 403 }
            );
        }

        const token = generateToken({
            userId: user._id.toString(),
            email: user.email,
            role: user.role,
        });

        return NextResponse.json({
            message: "Login successful",
            token,
            user: {
                id: user._id.toString(),
                _id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department,
                phone: user.phone,
                isEmailVerified: user.isEmailVerified,
                isApproved: user.isApproved,
                approvalStatus: user.approvalStatus,
                // Surfaced as "Member since" on the profile screen.
                createdAt: user.createdAt,
            },
        });
    } catch (error: unknown) {
        return errorResponse(error, "auth/login");
    }
}
