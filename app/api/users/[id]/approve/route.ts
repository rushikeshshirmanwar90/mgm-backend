import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { errorResponse, requireRole } from "@/lib/api-helpers";
import { approvalEmail, queueMail } from "@/lib/send-mail";

/**
 * Approves or rejects a pending staff registration.
 *
 * Rejection now records an explicit "rejected" state. It used to just set
 * isApproved back to false — indistinguishable from "not yet reviewed" — so
 * rejected registrants reappeared in the queue on every refresh.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;
        const { action } = await req.json();

        if (action !== "approve" && action !== "reject") {
            return NextResponse.json(
                { error: "Invalid action. Use 'approve' or 'reject'." },
                { status: 400 }
            );
        }

        const user = await User.findById(id);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // A manager must not be able to grant themselves — or another
        // manager/admin — anything through the staff approval queue.
        if (user.role !== "staff" && auth.user.role !== "admin") {
            return NextResponse.json(
                { error: "Only an admin can change the status of manager or admin accounts." },
                { status: 403 }
            );
        }

        if (action === "approve" && !user.isEmailVerified) {
            return NextResponse.json(
                {
                    error: "This user has not verified their email address yet, so they cannot be approved.",
                },
                { status: 400 }
            );
        }

        const approved = action === "approve";
        user.approvalStatus = approved ? "approved" : "rejected";
        user.reviewedBy = auth.user.userId as unknown as typeof user.reviewedBy;
        user.reviewedAt = new Date();
        await user.save();

        await Notification.create({
            userId: user._id,
            title: approved ? "Registration Approved 🎉" : "Registration Update",
            message: approved
                ? "Your staff account has been approved. You can now log in and raise maintenance complaints."
                : "Your staff account registration was not approved. Please contact the Estate Manager's office for details.",
            type: approved ? "registration_approved" : "registration_rejected",
        });

        // Deferred so the manager's tap returns immediately rather than waiting
        // on an SMTP round-trip.
        queueMail({ to: user.email, ...approvalEmail(user.name, approved) });

        const updated = await User.findById(id).select("-password");

        return NextResponse.json({
            message: approved
                ? "Staff user approved successfully"
                : "Staff user registration rejected",
            user: updated,
        });
    } catch (error: unknown) {
        return errorResponse(error, "users/[id]/approve");
    }
}
