import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import Room from "@/models/Room";
import { errorResponse, requireRole } from "@/lib/api-helpers";

const ROOM_TYPES = ["classroom", "washroom", "lab", "office", "library", "other"];

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const { id } = await params;

        const room = await Room.findById(id);
        if (!room) {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }
        return NextResponse.json({ room });
    } catch (error: unknown) {
        return errorResponse(error, "rooms/[id]/GET");
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
        const { roomNumber, roomType, name } = await req.json();

        if (roomType && !ROOM_TYPES.includes(roomType)) {
            return NextResponse.json(
                { error: `roomType must be one of: ${ROOM_TYPES.join(", ")}` },
                { status: 400 }
            );
        }

        const room = await Room.findById(id);
        if (!room) {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }

        if (roomNumber !== undefined) {
            const trimmed = String(roomNumber).trim();
            if (!trimmed) {
                return NextResponse.json(
                    { error: "Room number cannot be empty." },
                    { status: 400 }
                );
            }
            // Check the clash explicitly — the unique index would otherwise
            // surface as an opaque 500.
            if (trimmed.toUpperCase() !== room.roomNumber.toUpperCase()) {
                const clash = await Room.findOne({
                    floorId: room.floorId,
                    roomNumber: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
                });
                if (clash) {
                    return NextResponse.json(
                        { error: `Room ${trimmed} already exists on this floor.` },
                        { status: 409 }
                    );
                }
            }
            room.roomNumber = trimmed;
        }

        if (roomType !== undefined) room.roomType = roomType;
        if (name !== undefined) room.name = name;

        await room.save();

        return NextResponse.json({ message: "Room updated successfully", room });
    } catch (error: unknown) {
        return errorResponse(
            error,
            "rooms/[id]/PUT",
            "A room with that number already exists on this floor."
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;

        const room = await Room.findById(id);
        if (!room) {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }

        // Refuse to orphan complaint history — deleting the room would leave
        // existing complaints pointing at a location that no longer resolves.
        const linkedComplaints = await Complaint.countDocuments({ roomId: id });
        if (linkedComplaints > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete ${room.roomNumber}: ${linkedComplaints} complaint(s) reference it.`,
                },
                { status: 409 }
            );
        }

        await room.deleteOne();
        return NextResponse.json({ message: "Room deleted successfully" });
    } catch (error: unknown) {
        return errorResponse(error, "rooms/[id]/DELETE");
    }
}
