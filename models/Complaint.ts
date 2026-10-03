import mongoose, { Schema, Document } from "mongoose";
import {
    COMPLAINT_CATEGORIES,
    COST_ITEMS,
    STATUSES,
    type ComplaintCategory,
    type ComplaintStatus,
    type CostItemKey,
} from "@/lib/complaint-workflow";

export interface ICostItem {
    key: CostItemKey;
    amount: number;
}

export interface ICostDetail {
    /** Itemised expenditure (electrician, plumber, …, miscellaneous). */
    items: ICostItem[];
    /** What the miscellaneous amount was spent on. */
    miscDescription?: string;
    /** Rollups of `items`, kept so the spending reports can aggregate on them. */
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
    status: ComplaintStatus;
    category?: ComplaintCategory;
    /** What the category is, in the manager's words, when `category` is "other". */
    categoryOther?: string;
    /** The Estate Manager's estimate, which the Director approves against. */
    estimatedBudget?: number;
    estimateNotes?: string;
    estimatedBy?: mongoose.Types.ObjectId;
    estimatedAt?: Date;
    approvedBy?: mongoose.Types.ObjectId;
    approvedAt?: Date;
    /** Why the Director sent the estimate back. Cleared when it is resubmitted. */
    returnReason?: string;
    returnedBy?: mongoose.Types.ObjectId;
    returnedAt?: Date;
    /** The stage a held complaint resumes into. */
    heldFrom?: ComplaintStatus;
    workDoneAt?: Date;
    priority: "low" | "medium" | "high" | "critical";
    assignedTo?: mongoose.Types.ObjectId;
    costDetails?: ICostDetail;
    resolvedAt?: Date;
    rejectionReason?: string;
    holdReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CostItemSchema = new Schema<ICostItem>(
    {
        key: { type: String, enum: COST_ITEMS.map((i) => i.key), required: true },
        amount: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

const CostDetailSchema = new Schema<ICostDetail>(
    {
        items: { type: [CostItemSchema], default: [] },
        miscDescription: { type: String, trim: true },
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
            enum: STATUSES,
            default: "pending",
        },
        category: {
            type: String,
            enum: COMPLAINT_CATEGORIES,
        },
        categoryOther: { type: String, trim: true },
        estimatedBudget: { type: Number, min: 0 },
        estimateNotes: { type: String, trim: true },
        estimatedBy: { type: Schema.Types.ObjectId, ref: "User" },
        estimatedAt: { type: Date },
        approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
        approvedAt: { type: Date },
        returnReason: { type: String, trim: true },
        returnedBy: { type: Schema.Types.ObjectId, ref: "User" },
        returnedAt: { type: Date },
        heldFrom: { type: String, enum: STATUSES },
        workDoneAt: { type: Date },
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
        holdReason: {
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
