import mongoose from "mongoose";

const AdminNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, default: "" },
    severity: {
      type: String,
      enum: ["info", "success", "warning", "danger"],
      default: "info",
    },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AdminNotificationSchema.index({ createdAt: -1 });

export default mongoose.model("AdminNotification", AdminNotificationSchema);

