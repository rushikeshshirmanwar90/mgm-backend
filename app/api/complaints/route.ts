import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import Floor from "@/models/Floor";
import Notification from "@/models/Notification";
import Room from "@/models/Room";
import User from "@/models/User";
import { errorResponse, requireUser } from "@/lib/api-helpers";
import { serializeComplaint, serializeComplaints } from "@/lib/complaint-access";

const STATUSES = ["pending", "in_progress", "resolved", "rejected"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const LOCATION_TYPES = [
    "classroom",
    "washroom",
    "lab",
    "office",
    "library",
    "corridor",
    "other",
];

export async function GET(req: NextRequest) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const buildingId = searchParams.get("buildingId");
        const priority = searchParams.get("priority");

        const filter: Record<string, unknown> = {};

        // Staff can only ever see complaints they raised themselves.
        if (auth.user.role === "staff") {
            filter.raisedBy = auth.user.userId;
        }

        if (status && STATUSES.includes(status)) filter.status = status;
        if (priority && PRIORITIES.includes(priority)) filter.priority = priority;
        if (buildingId && mongoose.Types.ObjectId.isValid(buildingId)) {
            filter.buildingId = buildingId;
        }

        const complaints = await Complaint.find(filter)
            .populate("raisedBy", "name email department phone")
            .populate("buildingId", "name code")
            .populate("floorId", "name prefix floorNumber")
            .populate("roomId", "roomNumber roomType name")
            .sort({ createdAt: -1 });

        return NextResponse.json({
            complaints: serializeComplaints(complaints, auth.user.role),
        });
    } catch (error: unknown) {
        return errorResponse(error, "complaints/GET");
    }
}

export async function POST(req: NextRequest) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const {
            title,
            description,
            buildingId,
            floorId,
            roomId,
            locationType,
            photos,
            priority,
        } = await req.json();

        if (!title || !description || !buildingId || !floorId) {
            return NextResponse.json(
                { error: "Title, description, building, and floor are required" },
                { status: 400 }
            );
        }

        // Verify the location actually hangs together. Without this a complaint
        // could reference a floor in one building and a room in another, which
        // then renders as a nonsensical location for whoever has to fix it.
        const floor = await Floor.findById(floorId);
        if (!floor) {
            return NextResponse.json({ error: "Floor not found" }, { status: 404 });
        }
        if (floor.buildingId.toString() !== String(buildingId)) {
            return NextResponse.json(
                { error: "That floor does not belong to the selected building." },
                { status: 400 }
            );
        }

        if (roomId) {
            const room = await Room.findById(roomId);
            if (!room) {
                return NextResponse.json({ error: "Room not found" }, { status: 404 });
            }
            if (room.floorId.toString() !== String(floorId)) {
                return NextResponse.json(
                    { error: "That room does not belong to the selected floor." },
                    { status: 400 }
                );
            }
        }

        const complaint = await Complaint.create({
            title,
            description,
            raisedBy: auth.user.userId,
            buildingId,
            floorId,
            roomId: roomId || undefined,
            locationType: LOCATION_TYPES.includes(locationType) ? locationType : "classroom",
            photos: Array.isArray(photos) ? photos.filter((p) => typeof p === "string") : [],
            priority: PRIORITIES.includes(priority) ? priority : "medium",
            status: "pending",
        });

        const populated = await Complaint.findById(complaint._id)
            .populate("raisedBy", "name email")
            .populate("buildingId", "name code")
            .populate("floorId", "name prefix")
            .populate("roomId", "roomNumber name");

        // Alert every manager and admin so a new complaint shows up in their
        // notification feed instead of only being found by polling the list.
        const reviewers = await User.find({
            role: { $in: ["manager", "admin"] },
            approvalStatus: "approved",
        }).select("_id");

        if (reviewers.length > 0) {
            const location = [
                populated?.buildingId && "code" in populated.buildingId
                    ? (populated.buildingId as { code: string }).code
                    : null,
                populated?.roomId && "roomNumber" in populated.roomId
                    ? (populated.roomId as { roomNumber: string }).roomNumber
                    : populated?.floorId && "name" in populated.floorId
                      ? (populated.floorId as { name: string }).name
                      : null,
            ]
                .filter(Boolean)
                .join(" · ");

            await Notification.insertMany(
                reviewers.map((reviewer) => ({
                    userId: reviewer._id,
                    title: "New Complaint Raised 📩",
                    message: `${title}${location ? ` (${location})` : ""} — reported by ${
                        auth.user.email
                    }.`,
                    type: "new_complaint",
                    complaintId: complaint._id,
                }))
            );
        }

        return NextResponse.json(
            {
                message: "Complaint submitted successfully",
                complaint: populated
                    ? serializeComplaint(populated, auth.user.role)
                    : null,
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        return errorResponse(error, "complaints/POST");
    }
}
