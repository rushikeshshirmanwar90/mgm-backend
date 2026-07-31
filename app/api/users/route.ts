import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import { errorResponse, requireRole } from "@/lib/api-helpers";

const ROLES = ["staff", "manager", "admin"];

export async function GET(req: NextRequest) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { searchParams } = new URL(req.url);
        const role = searchParams.get("role");
        const status = searchParams.get("status");

        const filter: Record<string, unknown> = {};
        if (role && ROLES.includes(role)) filter.role = role;

        if (status === "pending") {
            // Only surface accounts that are actually actionable. Previously this
            // returned anyone with isApproved false — including people who had
            // never confirmed their email address, so a manager could approve an
            // unverified account, and rejected users who reappeared forever.
            filter.approvalStatus = "pending";
            filter.isEmailVerified = true;
        } else if (status === "approved") {
            filter.approvalStatus = "approved";
        } else if (status === "rejected") {
            filter.approvalStatus = "rejected";
        } else if (status === "unverified") {
            filter.isEmailVerified = false;
        }

        const users = await User.find(filter).select("-password").sort({ createdAt: -1 });

        return NextResponse.json({ users });
    } catch (error: unknown) {
        return errorResponse(error, "users/GET");
    }
}

/**
 * Creates a user directly, bypassing the sign-up + approval flow.
 *
 * Admin-only, because this is the one path that can mint a manager or another
 * admin. Public self-registration deliberately cannot set a role.
 */
export async function POST(req: NextRequest) {
    try {
        await connect();
        const auth = requireRole(req, "admin");
        if (!auth.ok) return auth.response;

        const { name, email, password, role, phone, department } = await req.json();

        if (!name || !email || !password || !role) {
            return NextResponse.json(
                { error: "Name, email, password, and role are required" },
                { status: 400 }
            );
        }

        if (!ROLES.includes(role)) {
            return NextResponse.json(
                { error: `Role must be one of: ${ROLES.join(", ")}` },
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
        if (await User.findOne({ email: normalizedEmail })) {
            return NextResponse.json(
                { error: "A user with this email already exists." },
                { status: 409 }
            );
        }

        const user = await User.create({
            name,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10),
            role,
            phone,
            department,
            // Admin-created accounts are trusted: no OTP, no approval queue.
            isEmailVerified: true,
            approvalStatus: "approved",
            reviewedBy: auth.user.userId,
            reviewedAt: new Date(),
        });

        const created = await User.findById(user._id).select("-password");

        return NextResponse.json(
            { message: `${role} account created successfully`, user: created },
            { status: 201 }
        );
    } catch (error: unknown) {
        return errorResponse(
            error,
            "users/POST",
            "A user with that email already exists."
        );
    }
}
