import mongoose from "mongoose";

const STATUS_VALUES = ["pending", "submitted", "verified", "rejected", "expired"];

const DocumentSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ["vendor", "company", "driver"],
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },
    title: { type: String, required: true },
    kind: { type: String, required: true },
    requirementKey: { type: String, default: null },
    url: { type: String, required: true },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: null },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: "pending",
    },
    expiresAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    uploadedAt: { type: Date, default: () => new Date() },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

DocumentSchema.index({ ownerType: 1, vendorId: 1, requirementKey: 1 });
DocumentSchema.index({ ownerType: 1, driverId: 1, requirementKey: 1 });
DocumentSchema.index({ ownerType: 1, status: 1 });

export default mongoose.model("Document", DocumentSchema);

