import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    city: { type: String, required: true },
    rating: { type: Number, default: 5 },
    earningsSplit: { type: Number, default: 0.7 },
    available: { type: Boolean, default: false },
    documents: { type: Object },
    lat: { type: Number },
    lng: { type: Number },
    heading: { type: Number },
    speedKph: { type: Number },
    accuracy: { type: Number },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Driver", driverSchema);

