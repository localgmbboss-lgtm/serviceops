import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actor: { type: String, trim: true },
    note: { type: String, trim: true },
    channel: {
      type: String,
      enum: ["call", "sms", "email", "in_app", "public_reply", "other"],
      default: "other",
    },
    status: {
      type: String,
      enum: ["open", "pending_customer", "pending_vendor", "closed"],
      default: "open",
    },
  },
  { _id: false }
);

const responseSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actor: { type: String, trim: true },
    channel: {
      type: String,
      enum: ["public", "private", "email", "sms", "system"],
      default: "public",
    },
    body: { type: String, trim: true },
  },
  { _id: false }
);

const feedbackSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
    source: {
      type: String,
      enum: ["survey", "public", "imported", "manual"],
      default: "survey",
    },
    channel: {
      type: String,
      enum: ["email", "sms", "web", "phone", "in_app"],
      default: "web",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
    },
    status: {
      type: String,
      enum: ["new", "triage", "responding", "resolved", "archived"],
      default: "new",
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    followUps: {
      type: [followUpSchema],
      default: [],
    },
    responseLog: {
      type: [responseSchema],
      default: [],
    },
    lastPublicReplyAt: { type: Date, default: null },
  },
  { timestamps: true }
);

feedbackSchema.index({ visibility: 1, status: 1, rating: -1 });

export default mongoose.model("Feedback", feedbackSchema);
