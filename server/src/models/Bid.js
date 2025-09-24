// server/src/models/Bid.js
import mongoose from "mongoose";
const BidSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
    index: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: false,
    index: true,
  },
  vendorName: { type: String }, // keep for compatibility
  vendorPhone: { type: String }, // keep for compatibility
  etaMinutes: { type: Number, min: 1, max: 480, required: true },
  price: { type: Number, min: 0, required: true },
  createdAt: { type: Date, default: Date.now },
});
BidSchema.index(
  { jobId: 1, vendorId: 1 },
  { unique: true, partialFilterExpression: { vendorId: { $exists: true } } }
);
export default mongoose.model("Bid", BidSchema);
