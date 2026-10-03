import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connect from "@/lib/db";
import Complaint from "@/models/Complaint";
import { Role } from "@/lib/auth";
import { errorResponse, requireRole, requireUser } from "@/lib/api-helpers";
import { populateComplaint, serializeComplaint } from "@/lib/complaint-access";
import { notify, reporterIdOf, usersWithRoles } from "@/lib/complaint-notify";
import {
    COMPLAINT_CATEGORIES,
    HOLDABLE,
    STATUS_LABELS,
    type ComplaintStatus,
} from "@/lib/complaint-workflow";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

/**
 * Fetches a single complaint.
 *
 * This handler previously had no auth check at all, which made every complaint
 * publicly readable by ID — leaking the reporter's name, email and department
 * along with the internal cost breakdown. Access is now: staff may read only
 * their own complaints, and costs are stripped for them; managers, directors
 * and admins read everything.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireUser(req);
        if (!auth.ok) return auth.response;

        const { id } = await params;

        const complaint = await populateComplaint(Complaint.findById(id));

        if (!complaint) {
            return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
        }

        if (auth.user.role === "staff") {
            if (reporterIdOf(complaint.raisedBy) !== auth.user.userId) {
                // 404 rather than 403 so this can't be used to confirm that a
                // given complaint ID exists.
                return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
            }
        }

        return NextResponse.json({
            complaint: serializeComplaint(complaint, auth.user.role),
        });
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/GET");
    }
}

/**
 * Moves a complaint through its workflow.
 *
 * The body names an `action` rather than a raw status, so each step can check
 * who is allowed to take it and which stage it may be taken from. A bare status
 * field would let any manager skip the Director's approval entirely.
 *
 *   estimate   manager   pending | awaiting_approval -> awaiting_approval  { category, estimatedBudget, estimateNotes? }
 *   approve    director  awaiting_approval -> approved
 *   return     director  awaiting_approval -> pending                      { reason }
 *   start      manager   approved -> in_progress
 *   work_done  manager   in_progress -> work_done
 *   hold       manager   pending | awaiting_approval | approved | in_progress -> on_hold  { reason }
 *   resume     manager   on_hold -> the stage it was held from
 *   reopen     manager   resolved | rejected -> in_progress
 *
 * Resolving happens through POST /cost, since recording the expenditure is
 * what closes a complaint out. `priority` may be sent alone or alongside any
 * manager action.
 */
const ACTIONS: Record<string, { roles: Role[]; from: ComplaintStatus[]; verb: string }> = {
    estimate: {
        roles: ["manager", "admin"],
        from: ["pending", "awaiting_approval"],
        verb: "given an estimate",
    },
    approve: { roles: ["director"], from: ["awaiting_approval"], verb: "approved" },
    return: { roles: ["director"], from: ["awaiting_approval"], verb: "sent back" },
    start: { roles: ["manager", "admin"], from: ["approved"], verb: "started" },
    work_done: { roles: ["manager", "admin"], from: ["in_progress"], verb: "marked as done" },
    hold: { roles: ["manager", "admin"], from: HOLDABLE, verb: "put on hold" },
    resume: { roles: ["manager", "admin"], from: ["on_hold"], verb: "resumed" },
    reopen: { roles: ["manager", "admin"], from: ["resolved", "rejected"], verb: "reopened" },
};

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connect();
        const auth = requireRole(req, "manager", "director", "admin");
        if (!auth.ok) return auth.response;

        const { id } = await params;
        const body = await req.json();
        const action: string | undefined = body.action;
        const priority: string | undefined = body.priority;

        if (!action && !priority) return fail("Nothing to update.");

        if (priority !== undefined) {
            if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
                return fail(`Priority must be one of: ${PRIORITIES.join(", ")}`);
            }
            if (auth.user.role === "director") {
                return fail("Directors can't change a complaint's priority.", 403);
            }
        }

        const rule = action ? ACTIONS[action] : undefined;
        if (action && !rule) {
            return fail(`Action must be one of: ${Object.keys(ACTIONS).join(", ")}`);
        }
        if (rule && !rule.roles.includes(auth.user.role)) {
            return fail(
                rule.roles.includes("director")
                    ? "Only a Director can do that."
                    : "Only the Estate Manager can do that.",
                403
            );
        }

        const complaint = await Complaint.findById(id);
        if (!complaint) return fail("Complaint not found", 404);

        const prevStatus = complaint.status as ComplaintStatus;
        if (rule && !rule.from.includes(prevStatus)) {
            return fail(
                `This complaint is "${STATUS_LABELS[prevStatus]}", so it can't be ${rule.verb} right now.`,
                409
            );
        }

        const me = new mongoose.Types.ObjectId(auth.user.userId);
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";

        switch (action) {
            case "estimate": {
                const budget = Number(body.estimatedBudget);
                if (!COMPLAINT_CATEGORIES.includes(body.category)) {
                    return fail("Pick a category for this complaint.");
                }
                const categoryOther =
                    typeof body.categoryOther === "string" ? body.categoryOther.trim() : "";
                if (body.category === "other" && !categoryOther) {
                    return fail("Say what the category is when choosing Other.");
                }
                if (!Number.isFinite(budget) || budget <= 0) {
                    return fail("The estimated budget must be a positive amount.");
                }
                complaint.category = body.category;
                complaint.categoryOther = body.category === "other" ? categoryOther : undefined;
                complaint.estimatedBudget = Math.round(budget * 100) / 100;
                complaint.estimateNotes =
                    typeof body.estimateNotes === "string" && body.estimateNotes.trim()
                        ? body.estimateNotes.trim()
                        : undefined;
                complaint.estimatedBy = me;
                complaint.estimatedAt = new Date();
                complaint.returnReason = undefined;
                complaint.status = "awaiting_approval";
                break;
            }
            case "approve":
                complaint.approvedBy = me;
                complaint.approvedAt = new Date();
                complaint.status = "approved";
                break;
            case "return":
                if (!reason) return fail("Say why the estimate is being sent back.");
                complaint.returnReason = reason;
                complaint.returnedBy = me;
                complaint.returnedAt = new Date();
                complaint.status = "pending";
                break;
            case "start":
                complaint.status = "in_progress";
                complaint.assignedTo = complaint.assignedTo ?? me;
                break;
            case "work_done":
                complaint.status = "work_done";
                complaint.workDoneAt = new Date();
                break;
            case "hold":
                if (!reason) return fail("A reason is required when putting a complaint on hold.");
                complaint.holdReason = reason;
                complaint.heldFrom = prevStatus;
                complaint.status = "on_hold";
                break;
            case "resume":
                complaint.status = complaint.heldFrom ?? "pending";
                complaint.heldFrom = undefined;
                break;
            case "reopen":
                complaint.status = "in_progress";
                complaint.resolvedAt = undefined;
                complaint.workDoneAt = undefined;
                break;
        }

        if (priority) complaint.priority = priority;

        await complaint.save();

        if (action) await announce(action, complaint, auth.user.userId);

        const updated = await populateComplaint(Complaint.findById(id));

        return NextResponse.json({
            message: "Complaint updated successfully",
            complaint: updated ? serializeComplaint(updated, auth.user.role) : null,
        });
    } catch (error: unknown) {
        return errorResponse(error, "complaints/[id]/PUT");
    }
}

interface ComplaintLike {
    _id: unknown;
    title: string;
    status: string;
    raisedBy: unknown;
    holdReason?: string;
    returnReason?: string;
}

/**
 * Tells the right people about a workflow step. The reporter hears about every
 * stage they can see; the money-side steps (estimate, approval, send-back) go
 * to whoever has to act next. Budget figures never go to the reporter.
 */
async function announce(action: string, complaint: ComplaintLike, actorId: string) {
    const reporter = reporterIdOf(complaint.raisedBy);
    const t = complaint.title;
    const opts = { exclude: actorId };

    switch (action) {
        case "estimate":
            await notify(
                await usersWithRoles("director"),
                complaint,
                "Approval Needed 📝",
                `"${t}" has an estimated budget and is waiting for your approval.`,
                opts
            );
            break;
        case "approve":
            await notify(
                [reporter],
                complaint,
                "Complaint Approved ✅",
                `Your complaint "${t}" has been approved. The maintenance team will start work on it soon.`,
                opts
            );
            await notify(
                await usersWithRoles("manager"),
                complaint,
                "Approved by Director ✅",
                `The Director approved the estimate for "${t}". You can start work on it now.`,
                opts
            );
            break;
        case "return":
            await notify(
                await usersWithRoles("manager"),
                complaint,
                "Estimate Sent Back ↩️",
                `The Director sent back the estimate for "${t}". Reason: ${complaint.returnReason}`,
                opts
            );
            break;
        case "start":
            await notify(
                [reporter],
                complaint,
                "Work Started 🛠️",
                `The maintenance team has started working on your complaint "${t}".`,
                opts
            );
            break;
        case "work_done":
            await notify(
                [reporter],
                complaint,
                "Work Done 🧰",
                `The repair work on your complaint "${t}" is finished. It will be marked resolved shortly.`,
                opts
            );
            break;
        case "hold":
            await notify(
                [reporter],
                complaint,
                "Complaint On Hold ⏸️",
                `Your complaint "${t}" has been put on hold. Reason: ${complaint.holdReason}`,
                opts
            );
            break;
        case "resume":
            await notify(
                [reporter],
                complaint,
                "Complaint Resumed ▶️",
                `Your complaint "${t}" is no longer on hold and is moving again.`,
                opts
            );
            break;
        case "reopen":
            await notify(
                [reporter],
                complaint,
                "Complaint Reopened 🔄",
                `Your complaint "${t}" has been reopened and the maintenance team is working on it again.`,
                opts
            );
            break;
    }
}
