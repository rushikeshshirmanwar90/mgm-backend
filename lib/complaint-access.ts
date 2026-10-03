import type { Query } from "mongoose";
import { Role } from "@/lib/auth";

/** Everything a complaint screen needs, populated the same way on every read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function populateComplaint<Q extends Query<any, any>>(query: Q): Q {
    return query
        .populate("raisedBy", "name email department phone")
        .populate("buildingId", "name code")
        .populate("floorId", "name prefix floorNumber")
        .populate("roomId", "roomNumber roomType name")
        .populate("assignedTo", "name email")
        .populate("estimatedBy", "name")
        .populate("approvedBy", "name")
        .populate("returnedBy", "name") as Q;
}

/**
 * Money is management data — the estimated budget, the Director's feedback on
 * it, and the final expenditure are for managers, directors and admins only.
 * Staff see the status of their own complaint, never what it cost to fix.
 */
export function canSeeCosts(role: Role): boolean {
    return role === "manager" || role === "director" || role === "admin";
}

/** Fields stripped from a complaint for roles that can't see costs. */
const COST_FIELDS = ["costDetails", "estimatedBudget", "estimateNotes", "returnReason"];

interface Serializable {
    toJSON(): Record<string, unknown>;
}

/**
 * Serialises a complaint for the given role, dropping the money fields when
 * that role isn't allowed to see them.
 *
 * Filtering has to happen on the server: sending costs down and hiding them in
 * the UI still exposes them to anyone reading the HTTP response.
 */
export function serializeComplaint(
    complaint: Serializable,
    role: Role
): Record<string, unknown> {
    const plain = complaint.toJSON();
    if (!canSeeCosts(role)) {
        for (const field of COST_FIELDS) delete plain[field];
    }
    return plain;
}

export function serializeComplaints(
    complaints: Serializable[],
    role: Role
): Record<string, unknown>[] {
    return complaints.map((c) => serializeComplaint(c, role));
}
