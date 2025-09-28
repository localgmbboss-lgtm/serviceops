import mongoose from "mongoose";

const CommissionChargeSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    reportedAmount: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true, min: 0, max: 1 },
    commissionAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed"],
      default: "pending",
      index: true,
    },
    processor: { type: String, default: "manual" },
    processorReference: { type: String, trim: true },
    failureReason: { type: String, trim: true },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

CommissionChargeSchema.index({ jobId: 1 }, { unique: true });
CommissionChargeSchema.index({ vendorId: 1, createdAt: -1 });

export default mongoose.model("CommissionCharge", CommissionChargeSchema);
