import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connect from "@/lib/db";
import Building from "@/models/Building";
import Floor from "@/models/Floor";
import { errorResponse, requireRole } from "@/lib/api-helpers";

/**
 * Conventional room prefix for a floor number: 0 -> G(round), 1 -> F(irst),
 * 2 -> S(econd), 3 -> T(hird), then numeric (4F, 5F, ...).
 */
function defaultPrefixFor(floorNumber: number): string {
    switch (floorNumber) {
        case 0:
            return "G";
        case 1:
            return "F";
        case 2:
            return "S";
        case 3:
            return "T";
        default:
            return `${floorNumber}F`;
    }
}

export async function GET(req: NextRequest) {
    try {
        await connect();
        const { searchParams } = new URL(req.url);
        const buildingId = searchParams.get("buildingId");

        const filter: Record<string, unknown> = {};
        if (buildingId) {
            if (!mongoose.Types.ObjectId.isValid(buildingId)) {
                return NextResponse.json({ error: "Invalid buildingId." }, { status: 400 });
            }
            filter.buildingId = buildingId;
        }

        const floors = await Floor.find(filter).sort({ floorNumber: 1 });
        return NextResponse.json({ floors });
    } catch (error: unknown) {
        return errorResponse(error, "floors/GET");
    }
}

export async function POST(req: NextRequest) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { buildingId, name, floorNumber, prefix } = await req.json();

        if (!buildingId || name === undefined || floorNumber === undefined) {
            return NextResponse.json(
                { error: "buildingId, name, and floorNumber are required" },
                { status: 400 }
            );
        }

        const parsedFloorNumber = Number(floorNumber);
        if (!Number.isInteger(parsedFloorNumber) || parsedFloorNumber < 0) {
            return NextResponse.json(
                { error: "Floor number must be 0 or greater (0 = ground floor)." },
                { status: 400 }
            );
        }

        const building = await Building.findById(buildingId);
        if (!building) {
            return NextResponse.json({ error: "Building not found" }, { status: 404 });
        }

        const existing = await Floor.findOne({
            buildingId,
            floorNumber: parsedFloorNumber,
        });
        if (existing) {
            return NextResponse.json(
                { error: `Floor number ${parsedFloorNumber} already exists in this building` },
                { status: 409 }
            );
        }

        const resolvedPrefix = (
            prefix ? String(prefix).trim() : defaultPrefixFor(parsedFloorNumber)
        ).toUpperCase();

        const floor = await Floor.create({
            buildingId,
            name: String(name).trim(),
            floorNumber: parsedFloorNumber,
            prefix: resolvedPrefix,
        });

        return NextResponse.json(
            { message: "Floor created successfully", floor },
            { status: 201 }
        );
    } catch (error: unknown) {
        return errorResponse(
            error,
            "floors/POST",
            "That floor number already exists in this building."
        );
    }
}
