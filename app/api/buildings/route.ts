import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Building from "@/models/Building";
import { errorResponse, requireRole } from "@/lib/api-helpers";

export async function GET() {
    try {
        await connect();
        const buildings = await Building.find().sort({ name: 1 });
        return NextResponse.json({ buildings });
    } catch (error: unknown) {
        return errorResponse(error, "buildings/GET");
    }
}

export async function POST(req: NextRequest) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "admin");
        if (!auth.ok) return auth.response;

        const { name, code, description, address } = await req.json();

        if (!name || !code) {
            return NextResponse.json(
                { error: "Building name and code are required" },
                { status: 400 }
            );
        }

        const normalizedCode = String(code).trim().toUpperCase();

        const existing = await Building.findOne({ code: normalizedCode });
        if (existing) {
            return NextResponse.json(
                { error: `A building with code ${normalizedCode} already exists.` },
                { status: 409 }
            );
        }

        const building = await Building.create({
            name: String(name).trim(),
            code: normalizedCode,
            description,
            address,
        });

        return NextResponse.json(
            { message: "Building created successfully", building },
            { status: 201 }
        );
    } catch (error: unknown) {
        return errorResponse(
            error,
            "buildings/POST",
            "A building with that code already exists."
        );
    }
}
