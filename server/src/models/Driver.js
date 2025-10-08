// Legacy driver schema retained for backwards compatibility with historical
// documents. New code should not create or update driver records.
import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    city: { type: String, trim: true },
    earningsSplit: { type: Number, default: 0.6 },
    available: { type: Boolean, default: true },
    lat: { type: Number },
    lng: { type: Number },
    heading: { type: Number },
    speedKph: { type: Number },
    accuracy: { type: Number },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Driver ||
  mongoose.model("Driver", driverSchema);
