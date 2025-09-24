import mongoose from "mongoose";

const OutboxSchema = new mongoose.Schema({
  kind: { type: String, enum: ["sms","email"], required: true },
  to: { type: String, required: true },       // phone or email
  body: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  status: { type: String, enum: ["queued","sent","failed"], default: "queued" },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date }
});

export default mongoose.model("Outbox", OutboxSchema);
