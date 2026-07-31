import { randomInt } from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// A predictable fallback secret would let anyone mint their own admin tokens,
// so in production we refuse to start rather than sign with a known key.
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error(
        "JWT_SECRET must be set in production. Refusing to fall back to a default secret."
    );
}

const JWT_SECRET = process.env.JWT_SECRET || "mgm-dev-only-secret";

export type Role = "staff" | "manager" | "admin";

export interface JWTPayload {
    userId: string;
    email: string;
    role: Role;
}

export function generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        return null;
    }
}

export function getTokenFromRequest(request: NextRequest): string | null {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }
    return null;
}

export function getUserFromRequest(request: NextRequest): JWTPayload | null {
    const token = getTokenFromRequest(request);
    if (!token) return null;
    return verifyToken(token);
}

// Generate a 6-digit OTP for email verification. Uses the crypto RNG rather
// than Math.random so codes can't be predicted from earlier ones.
export function generateOTP(): string {
    return randomInt(100000, 1000000).toString();
}
