import mongoose, { Schema, Document } from "mongoose";

export interface IRoom extends Document {
    _id: mongoose.Types.ObjectId;
    floorId: mongoose.Types.ObjectId;
    roomNumber: string; // G-1, F-2, S-3, etc.
    roomType: "classroom" | "washroom" | "lab" | "office" | "library" | "other";
    name?: string;
    createdAt: Date;
    updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
    {
        floorId: {
            type: Schema.Types.ObjectId,
            ref: "Floor",
            required: [true, "Floor ID is required"],
        },
        roomNumber: {
            type: String,
            required: [true, "Room number is required"],
            trim: true,
        },
        roomType: {
            type: String,
            enum: ["classroom", "washroom", "lab", "office", "library", "other"],
            default: "classroom",
        },
        name: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for unique room numbers per floor
RoomSchema.index({ floorId: 1, roomNumber: 1 }, { unique: true });

const Room = mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);
export default Room;
