// server/src/models/Vendor.js
import mongoose from "mongoose";

const complianceRequirementSchema = new mongoose.Schema(
  {
    key: { type: String },
    label: { type: String },
    status: {
      uploaded: { type: Boolean },
      valid: { type: Boolean },
      reason: { type: String },
    },
    document: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
      status: { type: String },
      url: { type: String },
      expiresAt: { type: Date },
      uploadedAt: { type: Date },
    },
  },
  { _id: false }
);

const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passHash: { type: String, default: null },

    city: { type: String, trim: true },
    services: [{ type: String, trim: true }],
    heavyDuty: { type: Boolean, default: false },
    radiusKm: { type: Number, default: 25 },
    baseAddress: { type: String, trim: true },

    earningsSplit: { type: Number, default: 0.6 },

    lat: { type: Number },
    lng: { type: Number },

    active: { type: Boolean, default: true },
    updatesPaused: { type: Boolean, default: false },

    lastSeenAt: { type: Date, default: null },

    billing: {
      provider: { type: String, trim: true },
      customerId: { type: String, trim: true },
      defaultPaymentMethodId: { type: String, trim: true },
      cardBrand: { type: String, trim: true },
      cardLast4: { type: String, trim: true },
      updatedAt: { type: Date },
    },

    tosAcceptedAt: { type: Date },

    complianceStatus: {
      type: String,
      enum: ["pending", "compliant", "non_compliant"],
      default: "pending",
    },
    compliance: {
      lastCheckedAt: { type: Date, default: null },
      enforcement: { type: String, default: "submission" },
      allowed: { type: Boolean, default: false },
      missing: {
        type: [
          new mongoose.Schema(
            {
              key: { type: String },
              label: { type: String },
              reason: { type: String },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
      requirements: {
        type: [complianceRequirementSchema],
        default: [],
      },
    },
    complianceOverride: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", VendorSchema);
