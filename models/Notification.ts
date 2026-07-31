import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    title: string;
    message: string;
    type: "complaint_update" | "complaint_resolved" | "new_complaint" | "registration_approved" | "registration_rejected";
    complaintId?: mongoose.Types.ObjectId;
    isRead: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"],
        },
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
        },
        type: {
            type: String,
            enum: [
                "complaint_update",
                "complaint_resolved",
                "new_complaint",
                "registration_approved",
                "registration_rejected",
            ],
            required: true,
        },
        complaintId: {
            type: Schema.Types.ObjectId,
            ref: "Complaint",
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient notification queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const Notification =
    mongoose.models.Notification ||
    mongoose.model<INotification>("Notification", NotificationSchema);
export default Notification;
