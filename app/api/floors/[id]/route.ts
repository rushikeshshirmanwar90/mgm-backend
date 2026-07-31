import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import Floor from "@/models/Floor";
import Room from "@/models/Room";
import { errorResponse, requireRole } from "@/lib/api-helpers";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const { id } = await params;

        const floor = await Floor.findById(id);
        if (!floor) {
            return NextResponse.json({ error: "Floor not found" }, { status: 404 });
        }

        const rooms = await Room.find({ floorId: id }).sort({ roomNumber: 1 });
        return NextResponse.json({ floor, rooms });
    } catch (error: unknown) {
        return errorResponse(error, "floors/[id]/GET");
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
        const { name, prefix, floorNumber } = await req.json();

        const floor = await Floor.findById(id);
        if (!floor) {
            return NextResponse.json({ error: "Floor not found" }, { status: 404 });
        }

        if (name !== undefined) {
            if (!String(name).trim()) {
                return NextResponse.json(
                    { error: "Floor name cannot be empty." },
                    { status: 400 }
                );
            }
            floor.name = String(name).trim();
        }

        if (floorNumber !== undefined) {
            const parsed = Number(floorNumber);
            if (!Number.isInteger(parsed)) {
                return NextResponse.json(
                    { error: "Floor number must be a whole number." },
                    { status: 400 }
                );
            }
            if (parsed !== floor.floorNumber) {
                const clash = await Floor.findOne({
                    buildingId: floor.buildingId,
                    floorNumber: parsed,
                });
                if (clash) {
                    return NextResponse.json(
                        { error: `Floor number ${parsed} already exists in this building.` },
                        { status: 409 }
                    );
                }
            }
            floor.floorNumber = parsed;
        }

        // Renaming the prefix would strand every existing room: the rooms keep
        // their old names (G-1) while the floor claims a new prefix (F), so
        // auto-numbering and the UI disagree. Only allow it on an empty floor.
        if (prefix !== undefined) {
            const newPrefix = String(prefix).trim().toUpperCase();
            if (!newPrefix) {
                return NextResponse.json(
                    { error: "Floor prefix cannot be empty." },
                    { status: 400 }
                );
            }
            if (newPrefix !== floor.prefix) {
                const roomCount = await Room.countDocuments({ floorId: id });
                if (roomCount > 0) {
                    return NextResponse.json(
                        {
                            error: `Cannot change the prefix while ${roomCount} room(s) exist on this floor — their numbers would no longer match. Delete or rename the rooms first.`,
                        },
                        { status: 409 }
                    );
                }
                floor.prefix = newPrefix;
            }
        }

        await floor.save();

        return NextResponse.json({ message: "Floor updated successfully", floor });
    } catch (error: unknown) {
        return errorResponse(
            error,
            "floors/[id]/PUT",
            "That floor number already exists in this building."
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

        const floor = await Floor.findById(id);
        if (!floor) {
            return NextResponse.json({ error: "Floor not found" }, { status: 404 });
        }

        const linkedComplaints = await Complaint.countDocuments({ floorId: id });
        if (linkedComplaints > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete ${floor.name}: ${linkedComplaints} complaint(s) reference it.`,
                },
                { status: 409 }
            );
        }

        await Room.deleteMany({ floorId: id });
        await floor.deleteOne();

        return NextResponse.json({ message: "Floor and its rooms deleted" });
    } catch (error: unknown) {
        return errorResponse(error, "floors/[id]/DELETE");
    }
}
