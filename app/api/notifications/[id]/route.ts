import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Notification from "@/models/Notification";
import { errorResponse, isValidObjectId, requireUser } from "@/lib/api-helpers";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const { id } = await params;

        if (id === "read-all") {
            const result = await Notification.updateMany(
                { userId: auth.user.userId, isRead: false },
                { isRead: true }
            );
            return NextResponse.json({
                message: "All notifications marked as read",
                modifiedCount: result.modifiedCount,
            });
        }

        if (!isValidObjectId(id)) {
            return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
        }

        // Scoping the update by userId means one user can never mark another
        // user's notification as read.
        const notification = await Notification.findOneAndUpdate(
            { _id: id, userId: auth.user.userId },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return NextResponse.json({ error: "Notification not found" }, { status: 404 });
        }

        return NextResponse.json({ notification });
    } catch (error: unknown) {
        return errorResponse(error, "notifications/[id]/PUT");
    }
}
