import mongoose from "mongoose";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { Role } from "@/lib/auth";
import { queueMail, statusUpdateEmail } from "@/lib/send-mail";

interface ComplaintRef {
    _id: unknown;
    title: string;
    status: string;
}

type NotificationType = "complaint_update" | "complaint_resolved" | "new_complaint";

/** Approved accounts holding any of `roles`. */
export async function usersWithRoles(...roles: Role[]): Promise<mongoose.Types.ObjectId[]> {
    const users = await User.find({
        role: { $in: roles },
        approvalStatus: "approved",
    }).select("_id");
    return users.map((u) => u._id);
}

/** The account that raised the complaint, whether `raisedBy` is populated or not. */
export function reporterIdOf(raisedBy: unknown): string | null {
    if (!raisedBy) return null;
    if (typeof raisedBy === "object" && "_id" in (raisedBy as object)) {
        return String((raisedBy as { _id: unknown })._id);
    }
    return String(raisedBy);
}

/**
 * Records an in-app notification for each recipient and queues a matching
 * email. Recipients are de-duplicated, and the person who triggered the change
 * is left out — they already know.
 *
 * Notifications are written synchronously (they're the durable record the apps
 * read); emails are deferred by `queueMail` so a slow SMTP server can't stall
 * the request.
 */
export async function notify(
    recipientIds: (string | mongoose.Types.ObjectId | null | undefined)[],
    complaint: ComplaintRef,
    title: string,
    message: string,
    options: { type?: NotificationType; exclude?: string; email?: boolean } = {}
) {
    const ids = [
        ...new Set(
            recipientIds
                .filter((id): id is string | mongoose.Types.ObjectId => !!id)
                .map(String)
        ),
    ].filter((id) => id !== options.exclude);

    if (ids.length === 0) return;

    await Notification.insertMany(
        ids.map((userId) => ({
            userId,
            title,
            message,
            type: options.type ?? "complaint_update",
            complaintId: complaint._id,
        }))
    );

    if (options.email === false) return;

    const recipients = await User.find({ _id: { $in: ids } }).select("name email");
    for (const r of recipients) {
        queueMail({
            to: r.email,
            ...statusUpdateEmail(r.name, title, message, complaint.title, complaint.status),
        });
    }
}
