import mongoose from "mongoose";

const PushSubscriptionSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      index: true,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    role: {
      type: String,
      enum: ["vendor", "admin", "customer"],
      required: true,
      default: "vendor",
      index: true,
    },
    subscription: {
      endpoint: { type: String, required: true },
      expirationTime: { type: Date },
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
      },
    },
    userAgent: { type: String, default: "" },
    platform: { type: String, default: "" },
    source: { type: String, default: "" },
    appBaseUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "expired"],
      default: "active",
      index: true,
    },
    lastUsedAt: { type: Date },
    failCount: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index(
  { "subscription.endpoint": 1 },
  { unique: true, sparse: true }
);

export default mongoose.model("PushSubscription", PushSubscriptionSchema);

