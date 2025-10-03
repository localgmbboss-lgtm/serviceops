// server/src/models/Settings.js
import mongoose from "mongoose";

const DocumentRequirementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: "" },
    kind: { type: String, required: true },
    required: { type: Boolean, default: true },
    accepts: {
      type: [String],
      default: () => ["pdf", "jpg", "jpeg", "png"],
    },
    expires: { type: Boolean, default: false },
    validityDays: { type: Number, default: null },
  },
  { _id: false }
);

const defaultVendorDocs = () => [
  {
    key: "government_id",
    label: "Government-issued ID",
    description: "Valid driver license or state-issued identification card for the primary operator.",
    kind: "identity",
    required: true,
    accepts: ["pdf", "jpg", "jpeg", "png"],
    expires: true,
    validityDays: 365,
  },
  {
    key: "vehicle_registration",
    label: "Vehicle Registration",
    description: "Registration document for the primary service vehicle.",
    kind: "registration",
    required: true,
    accepts: ["pdf", "jpg", "jpeg", "png"],
    expires: true,
    validityDays: 365,
  },
  {
    key: "insurance_certificate",
    label: "Proof of Insurance",
    description: "Certificate of insurance showing active coverage for roadside operations.",
    kind: "insurance",
    required: true,
    accepts: ["pdf", "jpg", "jpeg", "png"],
    expires: true,
    validityDays: 180,
  },
  {
    key: "tax_w9",
    label: "W-9 Tax Form",
    description: "Completed IRS W-9 for payout compliance.",
    kind: "tax",
    required: true,
    accepts: ["pdf"],
    expires: false,
    validityDays: null,
  },
];

const SettingsSchema = new mongoose.Schema(
  {
    // 1) Mode (solo vs team vs full)
    mode: {
      preset: { type: String, enum: ["solo", "team", "full"], default: "solo" },
    },

    // 2) Workflow toggles (feature flags)
    workflow: {
      requireDriverDocs: { type: Boolean, default: false },
      requireVendorDocs: { type: Boolean, default: true },
      showBusinessDocs: { type: Boolean, default: true },
      showLiveDriverMap: { type: Boolean, default: true },
      advancedJobWorkflow: { type: Boolean, default: false },
      enableCustomerPaymentScreen: { type: Boolean, default: false },
      enableReviewFunnel: { type: Boolean, default: true },
      multiServiceMode: { type: Boolean, default: true },
      showReportsTab: { type: Boolean, default: true },
      enableMessaging: { type: Boolean, default: false },
    },

    // 3) Defaults (global)
    defaults: {
      currency: { type: String, default: "USD" },
      defaultCity: { type: String, default: "" },
      // store as 0-1 internally (UI can accept "60" and convert to 0.6)
      defaultEarningsSplit: { type: Number, default: 0.6, min: 0, max: 1 },
    },

    // 4) Intervals (polling, etc.)
    intervals: {
      pollDriversSec: { type: Number, default: 7 },
      driverPatchSec: { type: Number, default: 15 },
      mapRefreshSec: { type: Number, default: 7 },
      vendorPollSec: { type: Number, default: 7 },
      vendorPushSec: { type: Number, default: 15 },
    },

    // 5) Reviews behavior
    reviews: {
      publicThreshold: { type: Number, default: 5, min: 1, max: 5 }, // >= threshold -> public route
      googlePublicUrl: { type: String, default: "" },
    },

    // 6) Commission defaults
    commission: {
      enabled: { type: Boolean, default: true },
      defaultRate: { type: Number, default: 0.3, min: 0, max: 1 },
      tolerancePct: { type: Number, default: 0.15, min: 0, max: 1 },
      toleranceAmount: { type: Number, default: 25, min: 0 },
      autoCharge: { type: Boolean, default: true },
    },

    // 7) Compliance settings
    compliance: {
      vendor: {
        enforce: {
          type: String,
          enum: ["off", "submission", "verified"],
          default: "submission",
        },
        autoSuspendOnExpiry: { type: Boolean, default: true },
        documents: {
          type: [DocumentRequirementSchema],
          default: defaultVendorDocs,
        },
      },
    },
  },
  {
    timestamps: true,
    minimize: false, // keep empty subdocs so your shallow merge always works
  }
);

export default mongoose.model("Settings", SettingsSchema);
