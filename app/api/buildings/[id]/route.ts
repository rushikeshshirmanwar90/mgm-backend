import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Building from "@/models/Building";
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

        const building = await Building.findById(id);
        if (!building) {
            return NextResponse.json({ error: "Building not found" }, { status: 404 });
        }

        const floors = await Floor.find({ buildingId: id }).sort({ floorNumber: 1 });
        const floorIds = floors.map((f) => f._id);
        const rooms = await Room.find({ floorId: { $in: floorIds } }).sort({ roomNumber: 1 });

        return NextResponse.json({ building, floors, rooms });
    } catch (error: unknown) {
        return errorResponse(error, "buildings/[id]/GET");
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
        const { name, code, description, address } = await req.json();

        const building = await Building.findById(id);
        if (!building) {
            return NextResponse.json({ error: "Building not found" }, { status: 404 });
        }

        // Only assign known fields. The previous version passed the raw request
        // body straight into findByIdAndUpdate, so any client could write
        // arbitrary keys onto the document.
        if (name !== undefined) {
            if (!String(name).trim()) {
                return NextResponse.json(
                    { error: "Building name cannot be empty." },
                    { status: 400 }
                );
            }
            building.name = String(name).trim();
        }

        if (code !== undefined) {
            const normalizedCode = String(code).trim().toUpperCase();
            if (!normalizedCode) {
                return NextResponse.json(
                    { error: "Building code cannot be empty." },
                    { status: 400 }
                );
            }
            if (normalizedCode !== building.code) {
                const clash = await Building.findOne({ code: normalizedCode });
                if (clash) {
                    return NextResponse.json(
                        { error: `A building with code ${normalizedCode} already exists.` },
                        { status: 409 }
                    );
                }
                building.code = normalizedCode;
            }
        }

        if (description !== undefined) building.description = description;
        if (address !== undefined) building.address = address;

        await building.save();

        return NextResponse.json({ message: "Building updated successfully", building });
    } catch (error: unknown) {
        return errorResponse(
            error,
            "buildings/[id]/PUT",
            "A building with that code already exists."
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;

        const building = await Building.findById(id);
        if (!building) {
            return NextResponse.json({ error: "Building not found" }, { status: 404 });
        }

        const linkedComplaints = await Complaint.countDocuments({ buildingId: id });
        if (linkedComplaints > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete ${building.name}: ${linkedComplaints} complaint(s) reference it.`,
                },
                { status: 409 }
            );
        }

        // Delete children before the parent, so a failure part-way through can't
        // leave floors and rooms stranded under a building that no longer exists.
        const floors = await Floor.find({ buildingId: id }).select("_id");
        await Room.deleteMany({ floorId: { $in: floors.map((f) => f._id) } });
        await Floor.deleteMany({ buildingId: id });
        await building.deleteOne();

        return NextResponse.json({ message: "Building and its floors/rooms deleted" });
    } catch (error: unknown) {
        return errorResponse(error, "buildings/[id]/DELETE");
    }
}
