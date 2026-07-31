import mongoose, { Schema, Document } from "mongoose";

export interface ICostDetail {
    laborCost: number;
    materialCost: number;
    otherCost: number;
    totalCost: number;
    notes?: string;
    addedBy: mongoose.Types.ObjectId;
    addedAt: Date;
    /** Set when the breakdown is later revised, so edits stay auditable. */
    updatedBy?: mongoose.Types.ObjectId;
    updatedAt?: Date;
}

export interface IComplaint extends Document {
    _id: mongoose.Types.ObjectId;
    title: string;
    description: string;
    raisedBy: mongoose.Types.ObjectId;
    buildingId: mongoose.Types.ObjectId;
    floorId: mongoose.Types.ObjectId;
    roomId?: mongoose.Types.ObjectId;
    locationType: "classroom" | "washroom" | "lab" | "office" | "library" | "corridor" | "other";
    photos: string[];
    status: "pending" | "in_progress" | "resolved" | "rejected";
    priority: "low" | "medium" | "high" | "critical";
    assignedTo?: mongoose.Types.ObjectId;
    costDetails?: ICostDetail;
    resolvedAt?: Date;
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CostDetailSchema = new Schema<ICostDetail>(
    {
        laborCost: { type: Number, default: 0 },
        materialCost: { type: Number, default: 0 },
        otherCost: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
        notes: { type: String, trim: true },
        addedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        addedAt: { type: Date, default: Date.now },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        updatedAt: { type: Date },
    },
    { _id: false }
);

const ComplaintSchema = new Schema<IComplaint>(
    {
        title: {
            type: String,
            required: [true, "Complaint title is required"],
            trim: true,
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
        },
        raisedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Raised by user is required"],
        },
        buildingId: {
            type: Schema.Types.ObjectId,
            ref: "Building",
            required: [true, "Building is required"],
        },
        floorId: {
            type: Schema.Types.ObjectId,
            ref: "Floor",
            required: [true, "Floor is required"],
        },
        roomId: {
            type: Schema.Types.ObjectId,
            ref: "Room",
        },
        locationType: {
            type: String,
            enum: ["classroom", "washroom", "lab", "office", "library", "corridor", "other"],
            default: "classroom",
        },
        photos: {
            type: [String],
            default: [],
        },
        status: {
            type: String,
            enum: ["pending", "in_progress", "resolved", "rejected"],
            default: "pending",
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "medium",
        },
        assignedTo: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        costDetails: {
            type: CostDetailSchema,
        },
        resolvedAt: {
            type: Date,
        },
        rejectionReason: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient querying
ComplaintSchema.index({ raisedBy: 1, status: 1 });
ComplaintSchema.index({ buildingId: 1, status: 1 });
ComplaintSchema.index({ status: 1, createdAt: -1 });

const Complaint =
    mongoose.models.Complaint ||
    mongoose.model<IComplaint>("Complaint", ComplaintSchema);
export default Complaint;
