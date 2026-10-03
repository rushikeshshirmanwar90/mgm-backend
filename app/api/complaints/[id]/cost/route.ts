import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import mongoose from "mongoose";
import { errorResponse, requireRole } from "@/lib/api-helpers";
import { populateComplaint, serializeComplaint } from "@/lib/complaint-access";
import { notify, reporterIdOf, usersWithRoles } from "@/lib/complaint-notify";
import { COST_ITEMS, type CostItemKey } from "@/lib/complaint-workflow";

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

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Records the expenditure for a finished repair.
 *
 * Body: `{ items: { electrician: 1200, materials: 800, … }, miscDescription?, notes? }`.
 *
 * Submitting against a complaint whose work is done is what resolves it, and
 * everyone involved — the reporter, the Estate Managers and the Directors — is
 * told. Once resolved, the breakdown can still be corrected (same call), which
 * doesn't re-notify anyone.
 */
async function saveExpenditure(req: NextRequest, params: Promise<{ id: string }>) {
    await connect();
    const auth = requireRole(req, "manager", "admin");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();

    const complaint = await Complaint.findById(id);
    if (!complaint) {
        return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    const resolving = complaint.status === "work_done";
    if (!resolving && complaint.status !== "resolved") {
        return NextResponse.json(
            { error: "Mark the work as done before submitting the expenditure." },
            { status: 409 }
        );
    }

    const input = (body.items ?? {}) as Record<string, unknown>;
    const items: { key: CostItemKey; amount: number }[] = [];
    const rollup = { labor: 0, material: 0, other: 0 };

    for (const { key, rollup: bucket } of COST_ITEMS) {
        const result = parseCost(input[key], key.replace(/_/g, " "));
        if (typeof result === "object") {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
        if (result > 0) {
            items.push({ key, amount: result });
            rollup[bucket] += result;
        }
    }

    const total = round(rollup.labor + rollup.material + rollup.other);
    if (total <= 0) {
        return NextResponse.json(
            { error: "Enter at least one expenditure amount." },
            { status: 400 }
        );
    }

    const miscDescription =
        typeof body.miscDescription === "string" ? body.miscDescription.trim() : "";
    if (rollup.other > 0 && !miscDescription) {
        return NextResponse.json(
            { error: "Say what the miscellaneous amount was spent on." },
            { status: 400 }
        );
    }

    const existing = complaint.costDetails;
    const me = new mongoose.Types.ObjectId(auth.user.userId);

    complaint.costDetails = {
        items,
        miscDescription: rollup.other > 0 ? miscDescription : undefined,
        laborCost: round(rollup.labor),
        materialCost: round(rollup.material),
        otherCost: round(rollup.other),
        totalCost: total,
        notes: typeof body.notes === "string" ? body.notes.trim() || undefined : undefined,
        // Preserve who first recorded the costs; track the latest editor too.
        addedBy: existing?.addedBy ?? me,
        addedAt: existing?.addedAt ?? new Date(),
        updatedBy: me,
        updatedAt: new Date(),
    };

    if (resolving) {
        complaint.status = "resolved";
        complaint.resolvedAt = new Date();
        complaint.assignedTo = complaint.assignedTo ?? me;
    }

    await complaint.save();

    if (resolving) {
        const t = complaint.title;
        const reporter = reporterIdOf(complaint.raisedBy);
        await notify(
            [reporter],
            complaint,
            "Complaint Solved! 🎉",
            `Thank you for raising the issue "${t}". The maintenance issue has been completely resolved!`,
            { type: "complaint_resolved", exclude: auth.user.userId }
        );
        await notify(
            (await usersWithRoles("manager", "director")).filter(
                (uid) => String(uid) !== reporter
            ),
            complaint,
            "Complaint Resolved ✅",
            `"${t}" has been resolved. Total expenditure: ₹${total.toLocaleString("en-IN")}.`,
            { type: "complaint_resolved", exclude: auth.user.userId }
        );
    }

    const updated = await populateComplaint(Complaint.findById(id));

    return NextResponse.json({
        message: resolving
            ? "Expenditure submitted and complaint resolved"
            : "Expenditure updated",
        costDetails: complaint.costDetails,
        complaint: serializeComplaint(updated ?? complaint, auth.user.role),
    });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        return await saveExpenditure(req, params);
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/cost/POST");
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        return await saveExpenditure(req, params);
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/cost/PUT");
    }
}
