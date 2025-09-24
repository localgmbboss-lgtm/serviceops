import mongoose from "mongoose";

const IntakeTokenSchema = new mongoose.Schema({
  token: { type: String, unique: true, index: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 }, // auto-expire in 7 days
});

export default mongoose.model("IntakeToken", IntakeTokenSchema);
