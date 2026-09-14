import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Notification from "@/models/Notification";
// Imported for its side effect: registers the Complaint model so populate()
// below can resolve the ref even if no complaint route has loaded yet.
import "@/models/Complaint";
import { errorResponse, requireUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        // The complaint's live status rides along so the manager/admin inbox
        // can offer approve / hold / reject on a new-complaint alert and show
        // what was decided afterwards, without a request per row.
        const notifications = await Notification.find({ userId: auth.user.userId })
            .populate("complaintId", "title status priority")
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            userId: auth.user.userId,
            isRead: false,
        });

        return NextResponse.json({ notifications, unreadCount });
    } catch (error: unknown) {
        return errorResponse(error, "notifications/GET");
    }
}
