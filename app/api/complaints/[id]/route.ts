import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { errorResponse, requireRole, requireUser } from "@/lib/api-helpers";
import { serializeComplaint } from "@/lib/complaint-access";
import { queueMail, statusUpdateEmail } from "@/lib/send-mail";

const STATUSES = ["pending", "in_progress", "resolved", "rejected"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

type Status = (typeof STATUSES)[number];

/**
 * Fetches a single complaint.
 *
 * This handler previously had no auth check at all, which made every complaint
 * publicly readable by ID — leaking the reporter's name, email and department
 * along with the internal cost breakdown. Access is now: staff may read only
 * their own complaints, and costs are stripped for them; managers and admins
 * read everything.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const { id } = await params;

        const complaint = await Complaint.findById(id)
            .populate("raisedBy", "name email department phone")
            .populate("buildingId", "name code")
            .populate("floorId", "name prefix floorNumber")
            .populate("roomId", "roomNumber roomType name")
            .populate("assignedTo", "name email");

        if (!complaint) {
            return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
        }

        if (auth.user.role === "staff") {
            // `raisedBy` is populated, so compare against its _id.
            const ownerId = complaint.raisedBy?._id?.toString() ?? complaint.raisedBy?.toString();
            if (ownerId !== auth.user.userId) {
                // 404 rather than 403 so this can't be used to confirm that a
                // given complaint ID exists.
                return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
            }
        }

        return NextResponse.json({
            complaint: serializeComplaint(complaint, auth.user.role),
        });
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/GET");
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;
        const { status, priority, rejectionReason } = await req.json();

        if (status && !STATUSES.includes(status)) {
            return NextResponse.json(
                { error: `Status must be one of: ${STATUSES.join(", ")}` },
                { status: 400 }
            );
        }

        if (priority && !PRIORITIES.includes(priority)) {
            return NextResponse.json(
                { error: `Priority must be one of: ${PRIORITIES.join(", ")}` },
                { status: 400 }
            );
        }

        if (status === "rejected" && !rejectionReason) {
            return NextResponse.json(
                { error: "A reason is required when rejecting a complaint." },
                { status: 400 }
            );
        }

        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
        }

        const prevStatus = complaint.status;
        if (status) complaint.status = status;
        if (priority) complaint.priority = priority;
        if (rejectionReason) complaint.rejectionReason = rejectionReason;

        if (status === "resolved" && prevStatus !== "resolved") {
            complaint.resolvedAt = new Date();
            complaint.assignedTo = complaint.assignedTo ?? auth.user.userId;
        }

        await complaint.save();

        if (status && status !== prevStatus) {
            await notifyReporter(complaint, status as Status);
        }

        const updatedComplaint = await Complaint.findById(id)
            .populate("raisedBy", "name email department phone")
            .populate("buildingId", "name code")
            .populate("floorId", "name prefix")
            .populate("roomId", "roomNumber name");

        return NextResponse.json({
            message: "Complaint updated successfully",
            complaint: updatedComplaint
                ? serializeComplaint(updatedComplaint, auth.user.role)
                : null,
        });
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/PUT");
    }
}

interface ComplaintLike {
    _id: unknown;
    title: string;
    raisedBy: unknown;
}

/**
 * Records an in-app notification for the reporter and queues a matching email.
 *
 * The notification is written synchronously (it's the durable record the staff
 * dashboard reads); the email is deferred via `after` so a slow SMTP server
 * can't stall the manager's request.
 */
async function notifyReporter(complaint: ComplaintLike, status: Status) {
    const reporter = await User.findById(complaint.raisedBy).select("name email");
    if (!reporter) return;

    let title = "Complaint Update";
    let message = `Your complaint "${complaint.title}" status has been updated to ${status.replace(
        "_",
        " "
    )}.`;

    if (status === "resolved") {
        title = "Complaint Solved! 🎉";
        message = `Thank you for raising the issue "${complaint.title}". The maintenance issue has been completely resolved!`;
    } else if (status === "in_progress") {
        title = "Work Started 🛠️";
        message = `The maintenance team has started working on your complaint "${complaint.title}".`;
    } else if (status === "rejected") {
        title = "Complaint Closed";
        message = `Your complaint "${complaint.title}" was reviewed and closed without repair work. Please contact the Estate Manager's office if the issue persists.`;
    }

    await Notification.create({
        userId: reporter._id,
        title,
        message,
        type: status === "resolved" ? "complaint_resolved" : "complaint_update",
        complaintId: complaint._id,
    });

    queueMail({
        to: reporter.email,
        ...statusUpdateEmail(reporter.name, title, message, complaint.title, status),
    });
}
