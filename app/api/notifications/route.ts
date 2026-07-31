import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Notification from "@/models/Notification";
import { errorResponse, requireUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const notifications = await Notification.find({ userId: auth.user.userId })
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
