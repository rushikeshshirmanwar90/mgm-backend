import mongoose, { Schema, Document } from "mongoose";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    password: string;
    role: "staff" | "manager" | "admin";
    phone?: string;
    department?: string;
    isEmailVerified: boolean;
    approvalStatus: ApprovalStatus;
    /** Virtual — true only when approvalStatus is "approved". */
    isApproved: boolean;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedAt?: Date;
    emailOTP?: string;
    emailOTPExpiry?: Date;
    /**
     * Password reset gets its own code, deliberately not reusing emailOTP.
     * Sharing one field let a reset code be redeemed at /auth/verify-email (and
     * the reverse), and meant requesting either one silently invalidated the
     * other.
     */
    passwordResetOTP?: string;
    passwordResetOTPExpiry?: Date;
    /** Wrong guesses against the current reset code; resets when one is issued. */
    passwordResetAttempts: number;
    /** Drives the resend cooldown. */
    passwordResetLastSentAt?: Date;
    /** Set on every password change, so tokens minted earlier can be rejected. */
    passwordChangedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
        },
        role: {
            type: String,
            enum: ["staff", "manager", "admin"],
            default: "staff",
        },
        phone: {
            type: String,
            trim: true,
        },
        department: {
            type: String,
            trim: true,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        // Tri-state so a rejected registrant is distinguishable from one who has
        // simply not been reviewed yet — otherwise rejected users reappear in the
        // manager's pending queue forever.
        approvalStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true,
        },
        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        reviewedAt: {
            type: Date,
        },
        emailOTP: {
            type: String,
            select: false,
        },
        emailOTPExpiry: {
            type: Date,
            select: false,
        },
        passwordResetOTP: {
            type: String,
            select: false,
        },
        passwordResetOTPExpiry: {
            type: Date,
            select: false,
        },
        passwordResetAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        passwordResetLastSentAt: {
            type: Date,
            select: false,
        },
        passwordChangedAt: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Kept as a virtual rather than a stored column so it can never drift out of
// sync with approvalStatus.
UserSchema.virtual("isApproved").get(function (this: IUser) {
    return this.approvalStatus === "approved";
});

const User = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export default User;
