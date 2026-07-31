import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import mongoose from "mongoose";
import { errorResponse, requireRole } from "@/lib/api-helpers";
import { serializeComplaint } from "@/lib/complaint-access";

type CostField = "laborCost" | "materialCost" | "otherCost";
const COST_FIELDS: CostField[] = ["laborCost", "materialCost", "otherCost"];

/**
 * Parses a cost input, rejecting negatives, NaN and Infinity.
 *
 * `Number(x) || 0` silently turned "abc" and -500 into usable values, which is
 * how a bad keystroke ends up in a maintenance budget report.
 */
function parseCost(value: unknown, field: string): number | { error: string } {
    if (value === undefined || value === null || value === "") return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return { error: `${field} must be a number.` };
    }
    if (parsed < 0) {
        return { error: `${field} cannot be negative.` };
    }
    return Math.round(parsed * 100) / 100;
}

/** POST replaces the whole breakdown; PUT patches whatever is supplied. */
async function upsertCost(
    req: NextRequest,
    params: Promise<{ id: string }>,
    mode: "replace" | "patch"
) {
    await connect();
    const auth = requireRole(req, "manager", "admin");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();

    const complaint = await Complaint.findById(id);
    if (!complaint) {
        return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    const existing = complaint.costDetails;
    if (mode === "patch" && !existing) {
        return NextResponse.json(
            { error: "No cost breakdown exists yet for this complaint. Use POST to create one." },
            { status: 404 }
        );
    }

    const costs: Record<CostField, number> = {
        laborCost: 0,
        materialCost: 0,
        otherCost: 0,
    };

    for (const field of COST_FIELDS) {
        // On a patch, an omitted field keeps its stored value; on a replace it
        // resets to zero.
        if (mode === "patch" && body[field] === undefined) {
            costs[field] = existing?.[field] ?? 0;
            continue;
        }
        const result = parseCost(body[field], field);
        if (typeof result === "object") {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
        costs[field] = result;
    }

    const notes =
        mode === "patch" && body.notes === undefined ? existing?.notes : body.notes;

    complaint.costDetails = {
        ...costs,
        totalCost:
            Math.round((costs.laborCost + costs.materialCost + costs.otherCost) * 100) / 100,
        notes,
        // Preserve who first recorded the costs; track the latest editor too.
        addedBy:
            existing?.addedBy ?? new mongoose.Types.ObjectId(auth.user.userId),
        addedAt: existing?.addedAt ?? new Date(),
        updatedBy: new mongoose.Types.ObjectId(auth.user.userId),
        updatedAt: new Date(),
    };

    await complaint.save();

    return NextResponse.json({
        message:
            mode === "replace"
                ? "Cost breakdown saved successfully"
                : "Cost breakdown updated successfully",
        costDetails: complaint.costDetails,
        complaint: serializeComplaint(complaint, auth.user.role),
    });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        return await upsertCost(req, params, "replace");
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/cost/POST");
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        return await upsertCost(req, params, "patch");
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/cost/PUT");
    }
}
