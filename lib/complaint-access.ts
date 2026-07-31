import { Role } from "@/lib/auth";

/**
 * Cost breakdowns are management data — only managers and admins may see them.
 * Staff see the status of their own complaint, never what it cost to fix.
 */
export function canSeeCosts(role: Role): boolean {
    return role === "manager" || role === "admin";
}

interface Serializable {
    toJSON(): Record<string, unknown>;
}

/**
 * Serialises a complaint for the given role, dropping `costDetails` when that
 * role isn't allowed to see it.
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
        delete plain.costDetails;
    }
    return plain;
}

export function serializeComplaints(
    complaints: Serializable[],
    role: Role
): Record<string, unknown>[] {
    return complaints.map((c) => serializeComplaint(c, role));
}
