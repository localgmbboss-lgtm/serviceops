import mongoose from "mongoose";

const VendorNotificationSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      index: true,
      default: null,
    },
    source: { type: String, default: "system" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    severity: {
      type: String,
      enum: ["info", "success", "warning", "danger"],
      default: "info",
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

VendorNotificationSchema.index({ vendorId: 1, createdAt: -1 });

export default mongoose.model(
  "VendorNotification",
  VendorNotificationSchema
);
