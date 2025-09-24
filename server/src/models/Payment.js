import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["cash", "zelle", "venmo", "square", "card", "other"],
      default: "cash",
    },
    receivedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
