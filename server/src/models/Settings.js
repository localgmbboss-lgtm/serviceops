// server/src/models/Settings.js
import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema(
  {
    // 1) Mode (solo vs team vs full)
    mode: {
      preset: { type: String, enum: ["solo", "team", "full"], default: "solo" },
    },

    // 2) Workflow toggles (feature flags)
    workflow: {
      requireDriverDocs: { type: Boolean, default: false },
      requireVendorDocs: { type: Boolean, default: false },
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
  },
  {
    timestamps: true,
    minimize: false, // keep empty subdocs so your shallow merge always works
  }
);

export default mongoose.model("Settings", SettingsSchema);


