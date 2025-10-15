import mongoose from "mongoose";

const cannedResponseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    channel: {
      type: String,
      enum: ["sms", "email", "push", "in_app"],
      default: "sms",
    },
  },
  { _id: false }
);

const KnowledgeBaseArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, trim: true },
    body: { type: String, required: true, trim: true },
    category: { type: String, trim: true, index: true },
    tags: {
      type: [String],
      default: [],
    },
    audience: {
      type: String,
      enum: ["admin", "dispatcher", "vendor", "customer", "all"],
      default: "all",
      index: true,
    },
    cannedResponses: {
      type: [cannedResponseSchema],
      default: [],
    },
    attachments: {
      type: [
        new mongoose.Schema(
          {
            label: { type: String, trim: true },
            href: { type: String, trim: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastPublishedAt: { type: Date },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

KnowledgeBaseArticleSchema.index({ title: "text", body: "text", tags: 1 });

export default mongoose.model(
  "KnowledgeBaseArticle",
  KnowledgeBaseArticleSchema
);
