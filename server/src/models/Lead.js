import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    channel: {
      type: String,
      enum: ["call", "sms", "email", "task", "other"],
      default: "task",
    },
    note: { type: String, trim: true },
    actor: { type: String, trim: true },
  },
  { _id: false }
);

const touchSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ["note", "call", "email", "sms", "meeting", "system"],
      default: "note",
    },
    summary: { type: String, trim: true },
    actor: { type: String, trim: true },
  },
  { _id: false }
);

const LeadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    source: { type: String, trim: true },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted", "lost"],
      default: "new",
      index: true,
    },
    pipelineStage: {
      type: String,
      enum: ["inbox", "nurturing", "negotiation", "won", "lost"],
      default: "inbox",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    tags: {
      type: [String],
      default: [],
    },
    notes: { type: String, trim: true },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null },
    convertedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    lastContactedAt: { type: Date },
    nextFollowUp: {
      at: { type: Date },
      channel: {
        type: String,
        enum: ["call", "sms", "email", "task", "other"],
        default: "call",
      },
      note: { type: String, trim: true },
    },
    reminders: {
      type: [followUpSchema],
      default: [],
    },
    touches: {
      type: [touchSchema],
      default: [],
    },
  },
  { timestamps: true }
);

LeadSchema.index({ status: 1, pipelineStage: 1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ nextFollowUp: 1 });

export default mongoose.model("Lead", LeadSchema);
