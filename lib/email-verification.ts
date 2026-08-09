import { randomBytes, timingSafeEqual } from "crypto";

/** How long a mailed OTP stays usable. */
export const OTP_TTL_MS = 15 * 60 * 1000;

/** Minimum gap between two "send me a code" requests for the same address. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * How long the proof-of-verification token is good for.
 *
 * This is the window between confirming the code and submitting the form, so it
 * only has to cover "finish typing your details" — not a whole session.
 */
export const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Wrong guesses allowed before the code is burned and a new one is required. */
export const MAX_OTP_ATTEMPTS = 5;

/** How long an untouched challenge row survives before the TTL index reaps it. */
export const CHALLENGE_TTL_MS = 60 * 60 * 1000;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: unknown): string {
    return String(email ?? "").toLowerCase().trim();
}

/**
 * Opaque proof that the holder solved the OTP for a given address.
 *
 * 32 random bytes rather than a signed JWT: it is single-use and server-side
 * state already, so there is nothing for a signature to buy us.
 */
export function generateVerificationToken(): string {
    return randomBytes(32).toString("hex");
}

/**
 * Constant-time string comparison.
 *
 * `===` on a secret leaks its prefix through timing. Lengths are compared first
 * because timingSafeEqual throws on a mismatch — that length check is not itself
 * secret, since both values here are fixed-width.
 */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) return false;
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}
