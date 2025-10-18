import mongoose from "mongoose";

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    fileName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    width: { type: Number },
    height: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ["customer", "vendor", "system"],
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    senderName: { type: String },
    body: { type: String, trim: true },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    readByCustomer: { type: Boolean, default: false },
    readByVendor: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ jobId: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);
