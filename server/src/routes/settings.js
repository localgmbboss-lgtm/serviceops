import { Router } from "express";
import Settings from "../models/Settings.js";
import Vendor from "../models/Vendor.js";
import { getVendorComplianceConfig, refreshVendorCompliance } from "../lib/compliance.js";

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

const serializeSettings = (settingsDoc) => {
  const settings = settingsDoc.toObject({ virtuals: false });
  const intervals = settings.intervals || {};
  const vendorPollSec = toNumber(
    intervals.vendorPollSec,
    toNumber(intervals.pollDriversSec, 7)
  );
  const vendorPushSec = toNumber(
    intervals.vendorPushSec,
    toNumber(intervals.driverPatchSec, 15)
  );
  const mapRefreshSec = toNumber(intervals.mapRefreshSec, 7);

  const compliance = settings.compliance || {};
  const vendorCompliance = compliance.vendor || {};

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
        autoSuspendOnExpiry:
          vendorCompliance.autoSuspendOnExpiry !== false,
        documents: sanitizeVendorDocuments(vendorCompliance.documents),
      },
    },
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
        nextIntervals.pollDriversSec = nextIntervals.vendorPollSec;
      }
      if (Object.prototype.hasOwnProperty.call(incoming, "vendorPushSec")) {
        nextIntervals.vendorPushSec = toNumber(incoming.vendorPushSec, 15);
        nextIntervals.driverPatchSec = nextIntervals.vendorPushSec;
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
      const enforce = next.enforce && allowedEnforcements.has(next.enforce)
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

    const saved = await settings.save();
    const response = serializeSettings(saved);
    res.json(response);

    const nextVendorConfig = await getVendorComplianceConfig();
    if (JSON.stringify(previousVendorConfig) !== JSON.stringify(nextVendorConfig)) {
      const vendors = await Vendor.find({}, { _id: 1 }).lean();
      setImmediate(() => {
        Promise.allSettled(
          vendors.map((vendor) => refreshVendorCompliance(vendor._id))
        ).catch((error) => {
          // eslint-disable-next-line no-console
          console.error("Failed to refresh vendor compliance after settings update", error);
        });
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
