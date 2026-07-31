import mongoose, { Schema, Document } from "mongoose";

export interface IBuilding extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    code: string;
    description?: string;
    address?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BuildingSchema = new Schema<IBuilding>(
    {
        name: {
            type: String,
            required: [true, "Building name is required"],
            trim: true,
        },
        code: {
            type: String,
            required: [true, "Building code is required"],
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

const Building =
    mongoose.models.Building ||
    mongoose.model<IBuilding>("Building", BuildingSchema);
export default Building;
