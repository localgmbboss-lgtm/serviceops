import { Router } from "express";
import Settings from "../models/Settings.js";
import Vendor from "../models/Vendor.js";
import {
  getVendorComplianceConfig,
  refreshVendorCompliance,
} from "../lib/compliance.js";

const router = Router();

const toNumber = (value, fallback = null) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const sanitizeVendorDocuments = (documents = []) => {
  if (!Array.isArray(documents)) return [];
  return documents
    .map((doc) => ({
      key: doc.key || doc.kind || "document",
      label: doc.label || doc.title || doc.key || doc.kind || "Document",
      description: doc.description || "",
      kind: doc.kind || doc.key || "general",
      required: doc.required !== false,
      accepts:
        Array.isArray(doc.accepts) && doc.accepts.length
          ? doc.accepts.map((ext) => String(ext).toLowerCase())
          : ["pdf", "jpg", "jpeg", "png"],
      expires: doc.expires === true,
      validityDays:
        doc.validityDays === null || doc.validityDays === undefined
          ? null
          : toNumber(doc.validityDays, null),
    }))
    .filter((doc) => doc.key && doc.kind);
};

const allowedEnforcements = new Set(["off", "submission", "verified"]);

const automationDefaults = {
  alerts: {
    customer: {
      driverEtaMinutes: 10,
      followUpSurveyHours: 1,
      reengagementDays: 14,
      channels: { sms: true, email: true, push: false },
    },
    vendor: {
      jobAssigned: true,
      slaReminderMinutes: 20,
      channels: { sms: true, email: false, push: true },
    },
  },
  digests: {
    adminDaily: {
      enabled: false,
      time: "07:30",
      channels: { email: true, sms: false, push: false },
    },
    adminWeekly: {
      enabled: true,
      weekday: "mon",
      time: "08:00",
      channels: { email: true, sms: false, push: false },
    },
    vendorWeekly: {
      enabled: true,
      weekday: "fri",
      time: "17:00",
      channels: { email: true, sms: false, push: true },
    },
  },
  compliance: {
    autoNotifyMissingDocs: true,
    remindBeforeExpiryDays: 7,
  },
};

const normalizeChannels = (channels = {}, defaults = {}) => ({
  sms:
    channels.sms !== undefined ? Boolean(channels.sms) : Boolean(defaults.sms),
  email:
    channels.email !== undefined
      ? Boolean(channels.email)
      : Boolean(defaults.email),
  push:
    channels.push !== undefined ? Boolean(channels.push) : Boolean(defaults.push),
});

const normalizeAutomation = (automation = {}) => {
  const alerts = automation.alerts || {};
  const digests = automation.digests || {};
  const complianceAutomation = automation.compliance || {};

  return {
    alerts: {
      customer: {
        driverEtaMinutes:
          toNumber(
            alerts.customer?.driverEtaMinutes,
            automationDefaults.alerts.customer.driverEtaMinutes
          ) || automationDefaults.alerts.customer.driverEtaMinutes,
        followUpSurveyHours:
          toNumber(
            alerts.customer?.followUpSurveyHours,
            automationDefaults.alerts.customer.followUpSurveyHours
          ) || automationDefaults.alerts.customer.followUpSurveyHours,
        reengagementDays:
          toNumber(
            alerts.customer?.reengagementDays,
            automationDefaults.alerts.customer.reengagementDays
          ) || automationDefaults.alerts.customer.reengagementDays,
        channels: normalizeChannels(
          alerts.customer?.channels,
          automationDefaults.alerts.customer.channels
        ),
      },
      vendor: {
        jobAssigned:
          alerts.vendor?.jobAssigned !== undefined
            ? Boolean(alerts.vendor.jobAssigned)
            : automationDefaults.alerts.vendor.jobAssigned,
        slaReminderMinutes:
          toNumber(
            alerts.vendor?.slaReminderMinutes,
            automationDefaults.alerts.vendor.slaReminderMinutes
          ) || automationDefaults.alerts.vendor.slaReminderMinutes,
        channels: normalizeChannels(
          alerts.vendor?.channels,
          automationDefaults.alerts.vendor.channels
        ),
      },
    },
    digests: {
      adminDaily: {
        enabled:
          digests.adminDaily?.enabled !== undefined
            ? Boolean(digests.adminDaily.enabled)
            : automationDefaults.digests.adminDaily.enabled,
        time:
          typeof digests.adminDaily?.time === "string" &&
          digests.adminDaily.time
            ? digests.adminDaily.time
            : automationDefaults.digests.adminDaily.time,
        channels: normalizeChannels(
          digests.adminDaily?.channels,
          automationDefaults.digests.adminDaily.channels
        ),
      },
      adminWeekly: {
        enabled:
          digests.adminWeekly?.enabled !== undefined
            ? Boolean(digests.adminWeekly.enabled)
            : automationDefaults.digests.adminWeekly.enabled,
        weekday:
          typeof digests.adminWeekly?.weekday === "string" &&
          digests.adminWeekly.weekday
            ? digests.adminWeekly.weekday
            : automationDefaults.digests.adminWeekly.weekday,
        time:
          typeof digests.adminWeekly?.time === "string" &&
          digests.adminWeekly.time
            ? digests.adminWeekly.time
            : automationDefaults.digests.adminWeekly.time,
        channels: normalizeChannels(
          digests.adminWeekly?.channels,
          automationDefaults.digests.adminWeekly.channels
        ),
      },
      vendorWeekly: {
        enabled:
          digests.vendorWeekly?.enabled !== undefined
            ? Boolean(digests.vendorWeekly.enabled)
            : automationDefaults.digests.vendorWeekly.enabled,
        weekday:
          typeof digests.vendorWeekly?.weekday === "string" &&
          digests.vendorWeekly.weekday
            ? digests.vendorWeekly.weekday
            : automationDefaults.digests.vendorWeekly.weekday,
        time:
          typeof digests.vendorWeekly?.time === "string" &&
          digests.vendorWeekly.time
            ? digests.vendorWeekly.time
            : automationDefaults.digests.vendorWeekly.time,
        channels: normalizeChannels(
          digests.vendorWeekly?.channels,
          automationDefaults.digests.vendorWeekly.channels
        ),
      },
    },
    compliance: {
      autoNotifyMissingDocs:
        complianceAutomation.autoNotifyMissingDocs !== undefined
          ? Boolean(complianceAutomation.autoNotifyMissingDocs)
          : automationDefaults.compliance.autoNotifyMissingDocs,
      remindBeforeExpiryDays:
        toNumber(
          complianceAutomation.remindBeforeExpiryDays,
          automationDefaults.compliance.remindBeforeExpiryDays
        ) || automationDefaults.compliance.remindBeforeExpiryDays,
    },
  };
};

const serializeSettings = (settingsDoc) => {
  const settings = settingsDoc.toObject({ virtuals: false });
  const intervals = settings.intervals || {};

  const vendorPollSec = toNumber(intervals.vendorPollSec, 7);
  const vendorPushSec = toNumber(intervals.vendorPushSec, 15);
  const mapRefreshSec = toNumber(intervals.mapRefreshSec, 7);

  const compliance = settings.compliance || {};
  const vendorCompliance = compliance.vendor || {};

  const automation = normalizeAutomation(settings.automation);

  return {
    ...settings,
    intervals: {
      ...intervals,
      vendorPollSec,
      vendorPushSec,
      mapRefreshSec,
    },
    compliance: {
      vendor: {
        enforce: vendorCompliance.enforce || "submission",
        autoSuspendOnExpiry: vendorCompliance.autoSuspendOnExpiry !== false,
        documents: sanitizeVendorDocuments(vendorCompliance.documents),
      },
    },
    automation,
  };
};

const ensureSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
};

router.get("/", async (_req, res, next) => {
  try {
    const settings = await ensureSettings();
    res.json(serializeSettings(settings));
  } catch (error) {
    next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const payload = req.body || {};
    const settings = await ensureSettings();
    const previousVendorConfig = await getVendorComplianceConfig();

    if (payload.mode) {
      settings.mode = { ...settings.mode, ...payload.mode };
    }

    if (payload.workflow) {
      settings.workflow = { ...settings.workflow, ...payload.workflow };
    }

    if (payload.defaults) {
      settings.defaults = { ...settings.defaults, ...payload.defaults };
    }

    if (payload.intervals) {
      const incoming = payload.intervals;
      const nextIntervals = { ...settings.intervals };
      if (Object.prototype.hasOwnProperty.call(incoming, "vendorPollSec")) {
        nextIntervals.vendorPollSec = toNumber(incoming.vendorPollSec, 7);
      }
      if (Object.prototype.hasOwnProperty.call(incoming, "vendorPushSec")) {
        nextIntervals.vendorPushSec = toNumber(incoming.vendorPushSec, 15);
      }
      if (Object.prototype.hasOwnProperty.call(incoming, "mapRefreshSec")) {
        nextIntervals.mapRefreshSec = toNumber(incoming.mapRefreshSec, 7);
      }
      settings.intervals = nextIntervals;
    }

    if (payload.reviews) {
      settings.reviews = { ...settings.reviews, ...payload.reviews };
    }

    if (payload.commission) {
      settings.commission = { ...settings.commission, ...payload.commission };
    }

    if (payload.compliance && payload.compliance.vendor) {
      const current = settings.compliance?.vendor || {};
      const next = payload.compliance.vendor;
      const enforce =
        next.enforce && allowedEnforcements.has(next.enforce)
          ? next.enforce
          : current.enforce || "submission";
      const autoSuspendOnExpiry =
        next.autoSuspendOnExpiry !== undefined
          ? Boolean(next.autoSuspendOnExpiry)
          : current.autoSuspendOnExpiry !== false;
      const documents = sanitizeVendorDocuments(
        Array.isArray(next.documents) && next.documents.length
          ? next.documents
          : current.documents
      );

      settings.compliance = settings.compliance || {};
      settings.compliance.vendor = {
        enforce,
        autoSuspendOnExpiry,
        documents,
      };
    }

    if (payload.automation) {
      const currentAutomation = settings.automation
        ? settings.automation.toObject
          ? settings.automation.toObject()
          : { ...settings.automation }
        : {};

      const incoming = payload.automation || {};
      const mergedPayload = {
        alerts: {
          customer: {
            ...currentAutomation.alerts?.customer,
            ...incoming.alerts?.customer,
            channels: {
              ...currentAutomation.alerts?.customer?.channels,
              ...incoming.alerts?.customer?.channels,
            },
          },
          vendor: {
            ...currentAutomation.alerts?.vendor,
            ...incoming.alerts?.vendor,
            channels: {
              ...currentAutomation.alerts?.vendor?.channels,
              ...incoming.alerts?.vendor?.channels,
            },
          },
        },
        digests: {
          adminDaily: {
            ...currentAutomation.digests?.adminDaily,
            ...incoming.digests?.adminDaily,
            channels: {
              ...currentAutomation.digests?.adminDaily?.channels,
              ...incoming.digests?.adminDaily?.channels,
            },
          },
          adminWeekly: {
            ...currentAutomation.digests?.adminWeekly,
            ...incoming.digests?.adminWeekly,
            channels: {
              ...currentAutomation.digests?.adminWeekly?.channels,
              ...incoming.digests?.adminWeekly?.channels,
            },
          },
          vendorWeekly: {
            ...currentAutomation.digests?.vendorWeekly,
            ...incoming.digests?.vendorWeekly,
            channels: {
              ...currentAutomation.digests?.vendorWeekly?.channels,
              ...incoming.digests?.vendorWeekly?.channels,
            },
          },
        },
        compliance: {
          ...currentAutomation.compliance,
          ...incoming.compliance,
        },
      };

      settings.automation = normalizeAutomation(mergedPayload);
    }

    const saved = await settings.save();
    const response = serializeSettings(saved);
    res.json(response);

    const nextVendorConfig = await getVendorComplianceConfig();
    if (
      JSON.stringify(previousVendorConfig) !==
      JSON.stringify(nextVendorConfig)
    ) {
      const vendors = await Vendor.find({}, { _id: 1 }).lean();
      setImmediate(() => {
        Promise.allSettled(
          vendors.map((vendor) => refreshVendorCompliance(vendor._id))
        ).catch((error) => {
          // eslint-disable-next-line no-console
          console.error(
            "Failed to refresh vendor compliance after settings update",
            error
          );
        });
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
