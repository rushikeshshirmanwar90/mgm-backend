import mongoose, { Schema, Document } from "mongoose";

export interface IFloor extends Document {
    _id: mongoose.Types.ObjectId;
    buildingId: mongoose.Types.ObjectId;
    name: string;
    floorNumber: number;
    prefix: string; // G for Ground, F for First, S for Second, T for Third, etc.
    createdAt: Date;
    updatedAt: Date;
}

const FloorSchema = new Schema<IFloor>(
    {
        buildingId: {
            type: Schema.Types.ObjectId,
            ref: "Building",
            required: [true, "Building ID is required"],
        },
        name: {
            type: String,
            required: [true, "Floor name is required"],
            trim: true,
        },
        floorNumber: {
            type: Number,
            required: [true, "Floor number is required"],
        },
        prefix: {
            type: String,
            required: [true, "Floor prefix is required"],
            uppercase: true,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index to ensure unique floor numbers per building
FloorSchema.index({ buildingId: 1, floorNumber: 1 }, { unique: true });

const Floor =
    mongoose.models.Floor || mongoose.model<IFloor>("Floor", FloorSchema);
export default Floor;
