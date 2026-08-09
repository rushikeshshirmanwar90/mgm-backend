import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, JWTPayload, Role } from "@/lib/auth";
import User from "@/models/User";

/**
 * Result of an auth guard. Either the caller is allowed (and we hand back the
 * JWT payload), or we hand back the response the route should return as-is.
 */
export type AuthResult =
    | { ok: true; user: JWTPayload }
    | { ok: false; response: NextResponse };

/** Requires a valid token, without caring about the role. */
export function requireUser(req: NextRequest): AuthResult {
    const user = getUserFromRequest(req);
    if (!user) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }
    return { ok: true, user };
}

/** Requires a valid token belonging to one of `roles`. */
export function requireRole(req: NextRequest, ...roles: Role[]): AuthResult {
    const result = requireUser(req);
    if (!result.ok) return result;

    if (!roles.includes(result.user.role)) {
        const label = roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(" or ");
        return {
            ok: false,
            response: NextResponse.json(
                { error: `Forbidden. ${label} access required.` },
                { status: 403 }
            ),
        };
    }
    return { ok: true, user: result.user };
}

/**
 * Requires a signed-in user whose account is actually approved.
 *
 * Staff may now sign in while their registration is still pending, so holding a
 * valid token no longer implies approval the way it did when login itself was
 * the gate. Anything that creates or changes data has to ask the database
 * instead — hence the extra round-trip. Read-only endpoints deliberately skip
 * this: a pending user seeing their own (empty) dashboard harms nothing.
 *
 * Managers and admins are provisioned already approved, so they short-circuit.
 */
export async function requireApprovedUser(req: NextRequest): Promise<AuthResult> {
    const result = requireUser(req);
    if (!result.ok) return result;
    if (result.user.role !== "staff") return result;

    // isApproved is a virtual over approvalStatus, so selecting the one field
    // is enough to read both.
    const account = await User.findById(result.user.userId).select("approvalStatus");
    if (!account) {
        return {
            ok: false,
            response: NextResponse.json({ error: "User not found" }, { status: 404 }),
        };
    }

    if (!account.isApproved) {
        return {
            ok: false,
            response: NextResponse.json(
                {
                    error:
                        account.approvalStatus === "rejected"
                            ? "Your registration was not approved, so you cannot raise complaints. Please contact the Estate Manager's office."
                            : "Your registration is still awaiting Estate Manager approval. You'll be able to raise complaints as soon as it is approved.",
                    isApproved: false,
                    approvalStatus: account.approvalStatus,
                },
                { status: 403 }
            ),
        };
    }

    return result;
}

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: number }).code === 11000
    );
}

/**
 * Turns a thrown error into a response.
 *
 * Client mistakes (validation, bad ObjectId, duplicate key) become 4xx with a
 * readable message. Anything unexpected is logged server-side and returned as a
 * generic 500 — raw driver errors must never reach the client, since they leak
 * collection names, index definitions and stored values.
 */
export function errorResponse(
    error: unknown,
    context: string,
    duplicateMessage = "That value already exists."
): NextResponse {
    if (isDuplicateKeyError(error)) {
        return NextResponse.json({ error: duplicateMessage }, { status: 400 });
    }

    if (error instanceof mongoose.Error.ValidationError) {
        const message = Object.values(error.errors)
            .map((e) => e.message)
            .join(" ");
        return NextResponse.json(
            { error: message || "Validation failed." },
            { status: 400 }
        );
    }

    if (error instanceof mongoose.Error.CastError) {
        return NextResponse.json(
            { error: `Invalid ${error.path === "_id" ? "id" : error.path}.` },
            { status: 400 }
        );
    }

    console.error(`[${context}]`, error);
    return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
    );
}

/** True when `id` is a well-formed ObjectId, so we can 400 before querying. */
export function isValidObjectId(id: string): boolean {
    return mongoose.Types.ObjectId.isValid(id);
}
