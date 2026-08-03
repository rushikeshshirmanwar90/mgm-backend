import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connect from "@/lib/db";
import User from "@/models/User";
import Complaint from "@/models/Complaint";
import Notification from "@/models/Notification";
import { errorResponse, isValidObjectId, requireRole } from "@/lib/api-helpers";

const ROLES = ["staff", "manager", "admin"];

/** Reads a single account. Managers and admins both use this. */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;
        if (!isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
        }

        const user = await User.findById(id).select("-password");
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ user });
    } catch (error: unknown) {
        return errorResponse(error, "users/[id]/GET");
    }
}

/**
 * Updates an account.
 *
 * Admin-only, matching POST /api/users: editing a role is the same privilege as
 * minting one, so it must not be reachable by a manager.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;
        if (!isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
        }

        const user = await User.findById(id);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const { name, email, password, role, phone, department } = await req.json();
        const isSelf = user._id.toString() === auth.user.userId;

        if (name !== undefined) {
            if (!String(name).trim()) {
                return NextResponse.json(
                    { error: "Name cannot be empty." },
                    { status: 400 }
                );
            }
            user.name = String(name).trim();
        }

        if (email !== undefined) {
            const normalized = String(email).toLowerCase().trim();
            if (!normalized) {
                return NextResponse.json(
                    { error: "Email cannot be empty." },
                    { status: 400 }
                );
            }
            if (normalized !== user.email) {
                const clash = await User.findOne({ email: normalized });
                if (clash) {
                    return NextResponse.json(
                        { error: "Another account already uses that email address." },
                        { status: 409 }
                    );
                }
                user.email = normalized;
            }
        }

        if (role !== undefined && role !== user.role) {
            if (!ROLES.includes(role)) {
                return NextResponse.json(
                    { error: `Role must be one of: ${ROLES.join(", ")}` },
                    { status: 400 }
                );
            }

            // Demoting yourself takes effect on the next request and would lock
            // you out of the very screen you are standing on.
            if (isSelf) {
                return NextResponse.json(
                    { error: "You cannot change your own role." },
                    { status: 409 }
                );
            }

            // Losing the last admin leaves nobody able to create one, since
            // POST /api/users is admin-only. That is unrecoverable from the UI.
            if (user.role === "admin") {
                const admins = await User.countDocuments({ role: "admin" });
                if (admins <= 1) {
                    return NextResponse.json(
                        {
                            error: "This is the only admin account. Promote another admin before changing this one's role.",
                        },
                        { status: 409 }
                    );
                }
            }

            user.role = role;

            // A promoted account is trusted from here on: it was reviewed by an
            // admin at the moment of promotion, so leaving it stuck in the staff
            // approval queue would be nonsense.
            if (role !== "staff") {
                user.isEmailVerified = true;
                user.approvalStatus = "approved";
            }
        }

        if (password !== undefined && password !== "") {
            if (typeof password !== "string" || password.length < 6) {
                return NextResponse.json(
                    { error: "Password must be at least 6 characters" },
                    { status: 400 }
                );
            }
            user.password = await bcrypt.hash(password, 10);
        }

        if (phone !== undefined) user.phone = String(phone).trim();
        if (department !== undefined) user.department = String(department).trim();

        await user.save();

        const updated = await User.findById(id).select("-password");
        return NextResponse.json({ message: "Account updated", user: updated });
    } catch (error: unknown) {
        return errorResponse(
            error,
            "users/[id]/PUT",
            "Another account already uses that email address."
        );
    }
}

/**
 * Deletes an account.
 *
 * Refuses when complaints still reference the user, following the same rule as
 * buildings and floors: a complaint whose reporter has vanished loses the only
 * record of who raised it.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;
        if (!isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
        }

        const user = await User.findById(id);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (user._id.toString() === auth.user.userId) {
            return NextResponse.json(
                { error: "You cannot delete the account you are signed in with." },
                { status: 409 }
            );
        }

        if (user.role === "admin") {
            const admins = await User.countDocuments({ role: "admin" });
            if (admins <= 1) {
                return NextResponse.json(
                    {
                        error: "This is the only admin account, so it cannot be deleted.",
                    },
                    { status: 409 }
                );
            }
        }

        const raised = await Complaint.countDocuments({ raisedBy: id });
        if (raised > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete ${user.name}: they raised ${raised} complaint(s). Reject the account instead to block sign-in while keeping the record.`,
                },
                { status: 409 }
            );
        }

        const assigned = await Complaint.countDocuments({ assignedTo: id });
        if (assigned > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete ${user.name}: they are assigned to ${assigned} complaint(s).`,
                },
                { status: 409 }
            );
        }

        // Notifications belong to the account and are meaningless without it.
        await Notification.deleteMany({ userId: id });
        await user.deleteOne();

        return NextResponse.json({ message: `${user.name}'s account was deleted` });
    } catch (error: unknown) {
        return errorResponse(error, "users/[id]/DELETE");
    }
}
