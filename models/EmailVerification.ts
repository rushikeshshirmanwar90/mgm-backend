import mongoose, { Schema, Document } from "mongoose";

/**
 * A pre-registration email challenge.
 *
 * Sign-up verifies the address *before* the account exists, so the OTP can't
 * live on the User document — there is no User yet. This collection holds the
 * short-lived challenge instead: the code we mailed out, how many wrong guesses
 * it has taken, and (once solved) the one-shot token that `POST /auth/register`
 * demands as proof the address was confirmed.
 *
 * Rows are throwaway. `expiresAt` carries a TTL index so abandoned attempts are
 * reaped by MongoDB rather than accumulating forever.
 */
export interface IEmailVerification extends Document {
    email: string;
    otp?: string;
    otpExpiry?: Date;
    /** Wrong guesses against the current code; resets each time one is issued. */
    attempts: number;
    verified: boolean;
    verificationToken?: string;
    tokenExpiry?: Date;
    /** Drives the resend cooldown. */
    lastSentAt?: Date;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const EmailVerificationSchema = new Schema<IEmailVerification>(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        // Secrets are `select: false` so a stray read of this collection can
        // never hand back a live code or token.
        otp: {
            type: String,
            select: false,
        },
        otpExpiry: {
            type: Date,
        },
        attempts: {
            type: Number,
            default: 0,
        },
        verified: {
            type: Boolean,
            default: false,
        },
        verificationToken: {
            type: String,
            select: false,
        },
        tokenExpiry: {
            type: Date,
        },
        lastSentAt: {
            type: Date,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

// expireAfterSeconds: 0 means "delete once expiresAt is in the past".
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailVerification =
    mongoose.models.EmailVerification ||
    mongoose.model<IEmailVerification>("EmailVerification", EmailVerificationSchema);

export default EmailVerification;
