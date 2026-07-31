import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connect from "@/lib/db";
import Floor from "@/models/Floor";
import Room from "@/models/Room";
import { errorResponse, requireRole } from "@/lib/api-helpers";

const ROOM_TYPES = ["classroom", "washroom", "lab", "office", "library", "other"];
const MAX_BATCH = 50;

export async function GET(req: NextRequest) {
    try {
        await connect();
        const { searchParams } = new URL(req.url);
        const floorId = searchParams.get("floorId");

        const filter: Record<string, unknown> = {};
        if (floorId) {
            if (!mongoose.Types.ObjectId.isValid(floorId)) {
                return NextResponse.json({ error: "Invalid floorId." }, { status: 400 });
            }
            filter.floorId = floorId;
        }

        const rooms = await Room.find(filter).sort({ roomNumber: 1 });
        return NextResponse.json({ rooms });
    } catch (error: unknown) {
        return errorResponse(error, "rooms/GET");
    }
}

/**
 * Works out the next room index on a floor, from the highest number already in
 * use rather than from the room count.
 *
 * Counting broke as soon as a floor held anything that isn't `PREFIX-<n>`: with
 * G-1, G-2, G-3 plus a G-WR washroom the count is 4, so the next room became
 * G-5 and G-4 was skipped. Numbering is deliberately monotonic — a deleted G-2
 * is not reissued, since reusing the number of a room that once existed makes
 * historical records ambiguous.
 */
function nextRoomIndex(prefix: string, existingNumbers: string[]): number {
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
    let highest = 0;
    for (const number of existingNumbers) {
        const match = number.match(pattern);
        if (match) {
            highest = Math.max(highest, parseInt(match[1], 10));
        }
    }
    return highest + 1;
}

export async function POST(req: NextRequest) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { floorId, roomType, customRoomNumber, name, count } = await req.json();

        if (!floorId) {
            return NextResponse.json({ error: "floorId is required" }, { status: 400 });
        }

        if (roomType && !ROOM_TYPES.includes(roomType)) {
            return NextResponse.json(
                { error: `roomType must be one of: ${ROOM_TYPES.join(", ")}` },
                { status: 400 }
            );
        }

        const floor = await Floor.findById(floorId);
        if (!floor) {
            return NextResponse.json({ error: "Floor not found" }, { status: 404 });
        }

        const requested = count === undefined ? 1 : Number(count);
        if (!Number.isInteger(requested) || requested < 1 || requested > MAX_BATCH) {
            return NextResponse.json(
                { error: `Number of rooms must be a whole number between 1 and ${MAX_BATCH}.` },
                { status: 400 }
            );
        }

        const existingRooms = await Room.find({ floorId }).select("roomNumber");
        const taken = new Set(existingRooms.map((r) => r.roomNumber.toUpperCase()));

        const resolvedType = roomType || "classroom";

        // A single explicitly-named room: check the clash up front so the caller
        // gets a clear 400 instead of a raw duplicate-key error.
        if (customRoomNumber && requested === 1) {
            const roomNumber = String(customRoomNumber).trim();
            if (!roomNumber) {
                return NextResponse.json(
                    { error: "Room number cannot be empty." },
                    { status: 400 }
                );
            }
            if (taken.has(roomNumber.toUpperCase())) {
                return NextResponse.json(
                    { error: `Room ${roomNumber} already exists on ${floor.name}.` },
                    { status: 409 }
                );
            }

            const room = await Room.create({
                floorId,
                roomNumber,
                roomType: resolvedType,
                name: name || defaultRoomName(resolvedType, roomNumber, floor.name),
            });

            return NextResponse.json(
                { message: "1 room created successfully", rooms: [room] },
                { status: 201 }
            );
        }

        // Batch create with auto-numbering (G-1, G-2, F-1, ...).
        let index = nextRoomIndex(floor.prefix, existingRooms.map((r) => r.roomNumber));
        const docs = [];

        for (let i = 0; i < requested; i++) {
            while (taken.has(`${floor.prefix}-${index}`.toUpperCase())) index++;
            const roomNumber = `${floor.prefix}-${index}`;
            taken.add(roomNumber.toUpperCase());
            index++;

            docs.push({
                floorId,
                roomNumber,
                roomType: resolvedType,
                name: name || defaultRoomName(resolvedType, roomNumber, floor.name),
            });
        }

        const rooms = await Room.insertMany(docs);

        return NextResponse.json(
            { message: `${rooms.length} room(s) created successfully`, rooms },
            { status: 201 }
        );
    } catch (error: unknown) {
        return errorResponse(
            error,
            "rooms/POST",
            "A room with that number already exists on this floor."
        );
    }
}

function defaultRoomName(roomType: string, roomNumber: string, floorName: string): string {
    switch (roomType) {
        case "washroom":
            return `${floorName} Washroom ${roomNumber}`;
        case "lab":
            return `Lab ${roomNumber}`;
        case "office":
            return `Office ${roomNumber}`;
        case "library":
            return `Library ${roomNumber}`;
        case "other":
            return roomNumber;
        default:
            return `Classroom ${roomNumber}`;
    }
}
