/**
 * View types for the admin console.
 *
 * These describe the JSON the API actually returns (populated references,
 * stringified ObjectIds) rather than the Mongoose documents, so console code
 * never has to reason about model internals.
 */

export type Role = "staff" | "manager" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ComplaintStatus = "pending" | "in_progress" | "resolved" | "rejected";
export type Priority = "low" | "medium" | "high" | "critical";

export interface ConsoleUser {
    _id: string;
    id?: string;
    name: string;
    email: string;
    role: Role;
    phone?: string;
    department?: string;
    isEmailVerified: boolean;
    isApproved: boolean;
    approvalStatus?: ApprovalStatus;
    createdAt?: string;
}

export interface Building {
    _id: string;
    name: string;
    code: string;
    description?: string;
    address?: string;
}

export interface Floor {
    _id: string;
    buildingId: string;
    name: string;
    floorNumber: number;
    prefix: string;
}

export interface Room {
    _id: string;
    floorId: string;
    roomNumber: string;
    roomType: "classroom" | "washroom" | "lab" | "office" | "library" | "other";
    name?: string;
}

export interface CostDetail {
    laborCost: number;
    materialCost: number;
    otherCost: number;
    totalCost: number;
    notes?: string;
}

/** References arrive populated from the list endpoints, but stay defensive. */
export interface Complaint {
    _id: string;
    title: string;
    description: string;
    raisedBy: ConsoleUser | string;
    buildingId: Building | string;
    floorId: Floor | string;
    roomId?: Room | string;
    locationType: string;
    photos: string[];
    status: ComplaintStatus;
    priority: Priority;
    costDetails?: CostDetail;
    resolvedAt?: string;
    rejectionReason?: string;
    createdAt: string;
    updatedAt: string;
}

// ---- Response envelopes ----

export interface UsersResponse {
    users: ConsoleUser[];
}
export interface UserResponse {
    message?: string;
    user: ConsoleUser;
}
export interface BuildingsResponse {
    buildings: Building[];
}
export interface BuildingResponse {
    message?: string;
    building: Building;
}
export interface FloorsResponse {
    floors: Floor[];
}
export interface FloorResponse {
    message?: string;
    floor: Floor;
}
export interface RoomsResponse {
    message?: string;
    rooms: Room[];
}
export interface ComplaintsResponse {
    complaints: Complaint[];
}
export interface LoginResponse {
    token: string;
    user: ConsoleUser;
}
export interface MeResponse {
    user: ConsoleUser;
}

// ---- Display helpers ----

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function nameOf(ref: { name: string } | string | undefined, fallback = "—"): string {
    if (!ref) return fallback;
    return typeof ref === "object" ? ref.name : fallback;
}

export function idOf(ref: { _id: string } | string | undefined): string | null {
    if (!ref) return null;
    return typeof ref === "object" ? ref._id : ref;
}
