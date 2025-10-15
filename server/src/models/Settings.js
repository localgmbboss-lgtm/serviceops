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
      requireVendorDocs: { type: Boolean, default: true },
      showBusinessDocs: { type: Boolean, default: true },
      showLiveVendorMap: { type: Boolean, default: true },
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

    // 8) Automation + messaging schedules
    automation: {
      alerts: {
        customer: {
          driverEtaMinutes: { type: Number, default: 10 },
          followUpSurveyHours: { type: Number, default: 1 },
          reengagementDays: { type: Number, default: 14 },
          channels: {
            sms: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: false },
          },
        },
        vendor: {
          jobAssigned: { type: Boolean, default: true },
          slaReminderMinutes: { type: Number, default: 20 },
          channels: {
            sms: { type: Boolean, default: true },
            email: { type: Boolean, default: false },
            push: { type: Boolean, default: true },
          },
        },
      },
      digests: {
        adminDaily: {
          enabled: { type: Boolean, default: false },
          time: { type: String, default: "07:30" },
          channels: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: false },
          },
        },
        adminWeekly: {
          enabled: { type: Boolean, default: true },
          weekday: {
            type: String,
            enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
            default: "mon",
          },
          time: { type: String, default: "08:00" },
          channels: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: false },
          },
        },
        vendorWeekly: {
          enabled: { type: Boolean, default: true },
          weekday: {
            type: String,
            enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
            default: "fri",
          },
          time: { type: String, default: "17:00" },
          channels: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: true },
          },
        },
      },
      compliance: {
        autoNotifyMissingDocs: { type: Boolean, default: true },
        remindBeforeExpiryDays: { type: Number, default: 7 },
      },
    },
  },
  {
    timestamps: true,
    minimize: false, // keep empty subdocs so your shallow merge always works
  }
);

export default mongoose.model("Settings", SettingsSchema);
