import { Router } from "express";
import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";
import Job from "../models/Jobs.js";
import Feedback from "../models/Feedback.js";
import Payment from "../models/Payment.js";
import Document from "../models/Document.js";
import { complianceSummary, refreshVendorCompliance } from "../lib/compliance.js";
import {
  broadcastVendorUpdate,
  broadcastVendorRemoval,
} from "../realtime/index.js";
import { requireAdminAuth } from "./adminAuth.js";
import {
  isPushConfigured,
  registerAdminSubscription,
  unregisterSubscription,
} from "../lib/push.js";

const router = Router();

const sanitizeId = (value) =>
  value && mongoose.Types.ObjectId.isValid(value) ? String(value) : null;

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return Boolean(value);
};

const asCurrency = (value) => (Number.isFinite(value) ? value : 0);

const buildVendorActivity = (vendor) => ({
  lastSeenAt: vendor.lastSeenAt || vendor.updatedAt || null,
  active: vendor.active !== false,
  updatesPaused: vendor.updatesPaused === true,
});

const serializeVendorListItem = (vendor, compliance, stats) => ({
  _id: vendor._id,
  name: vendor.name,
  phone: vendor.phone || "",
  email: vendor.email || "",
  city: vendor.city || "",
  services: Array.isArray(vendor.services) ? vendor.services : [],
  heavyDuty: !!vendor.heavyDuty,
  complianceStatus: vendor.complianceStatus || "pending",
  compliance,
  complianceOverride: vendor.complianceOverride === true,
  stats,
  activity: buildVendorActivity(vendor),
});

const summarizeVendorStats = ({
  vendor,
  jobs = [],
  paymentsByJob = new Map(),
  feedbackByJob = new Map(),
}) => {
  const completed = jobs.filter((job) => job.status === "Completed");
  const activeJobs = jobs.filter((job) => job.status !== "Completed");

  const revenue = completed.reduce(
    (sum, job) => sum + asCurrency(paymentsByJob.get(String(job._id)) || 0),
    0
  );

  const split =
    vendor?.earningsSplit != null
      ? vendor.earningsSplit > 1
        ? vendor.earningsSplit / 100
        : vendor.earningsSplit
      : 0.6;
  const payoutOwed = revenue * split;

  const avgRating =
    completed.length > 0
      ? completed.reduce(
          (sum, job) => sum + (feedbackByJob.get(String(job._id))?.rating || 0),
          0
        ) / completed.length
      : 0;

  const commissionCollected = completed.reduce(
    (sum, job) => sum + asCurrency(job.commission?.amount),
    0
  );

  return {
    completed: completed.length,
    activeJobs: activeJobs.length,
    avgRating,
    revenue,
    payoutOwed,
    commission: commissionCollected,
  };
};

const buildComplianceSummary = async (vendorId) =>
  complianceSummary({ ownerType: "vendor", vendorId });

router.get("/vendors", async (_req, res, next) => {
  try {
    const vendors = await Vendor.find({}).sort({ name: 1 }).lean();
    res.json(
      vendors.map((v) => ({
        _id: v._id,
        name: v.name,
        phone: v.phone || "",
        email: v.email || "",
        city: v.city || "",
        services: Array.isArray(v.services) ? v.services : [],
        heavyDuty: !!v.heavyDuty,
        lat: typeof v.lat === "number" ? v.lat : null,
        lng: typeof v.lng === "number" ? v.lng : null,
        active: v.active !== false,
        updatesPaused: v.updatesPaused === true,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/vendors/overview", async (_req, res, next) => {
  try {
    const vendors = await Vendor.find({}).lean();
    const vendorIds = vendors.map((v) => String(v._id));
    if (!vendorIds.length) {
      res.json([]);
      return;
    }

    const jobs = await Job.find({ vendorId: { $in: vendorIds } }).lean();
    const byVendorJobs = new Map(vendorIds.map((id) => [id, []]));
    jobs.forEach((job) => {
      const key = String(job.vendorId);
      if (byVendorJobs.has(key)) {
        byVendorJobs.get(key).push(job);
      }
    });

    const completedIds = jobs
      .filter((job) => job.status === "Completed")
      .map((job) => String(job._id));

    const payments = await Payment.find({
      jobId: { $in: completedIds },
    }).lean();
    const paymentsByJob = new Map();
    payments.forEach((payment) => {
      const key = String(payment.jobId);
      const current = paymentsByJob.get(key) || 0;
      paymentsByJob.set(key, current + (payment.amount || 0));
    });

    const feedback = await Feedback.find({
      jobId: { $in: completedIds },
    }).lean();
    const feedbackByJob = new Map(
      feedback.map((entry) => [String(entry.jobId), entry])
    );

    const summaries = await Promise.all(
      vendors.map(async (vendor) => {
        const compliance = await buildComplianceSummary(vendor._id);
        const stats = summarizeVendorStats({
          vendor,
          jobs: byVendorJobs.get(String(vendor._id)) || [],
          paymentsByJob,
          feedbackByJob,
        });

        return serializeVendorListItem(vendor, compliance, stats);
      })
    );

    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

const serializeDocument = (doc) => ({
  _id: doc._id,
  title: doc.title,
  kind: doc.kind,
  requirementKey: doc.requirementKey,
  status: doc.status,
  url: doc.url,
  uploadedAt: doc.uploadedAt,
  expiresAt: doc.expiresAt,
  notes: doc.notes || "",
  metadata: doc.metadata || null,
});

const buildVendorDetail = async (vendor) => {
  if (!vendor) return null;

  const vendorId = String(vendor._id);
  const jobs = await Job.find({ vendorId }).sort({ created: -1 }).limit(50).lean();
  const completedIds = jobs
    .filter((job) => job.status === "Completed")
    .map((job) => String(job._id));

  const [payments, feedback, docs, compliance] = await Promise.all([
    Payment.find({ jobId: { $in: completedIds } }).lean(),
    Feedback.find({ jobId: { $in: completedIds } }).lean(),
    Document.find({ ownerType: "vendor", vendorId }).lean(),
    buildComplianceSummary(vendor._id),
  ]);

  const paymentsByJob = new Map();
  payments.forEach((payment) => {
    const key = String(payment.jobId);
    const current = paymentsByJob.get(key) || 0;
    paymentsByJob.set(key, current + (payment.amount || 0));
  });
  const feedbackByJob = new Map(
    feedback.map((entry) => [String(entry.jobId), entry])
  );

  const stats = summarizeVendorStats({
    vendor,
    jobs,
    paymentsByJob,
    feedbackByJob,
  });

  const split =
    vendor?.earningsSplit != null
      ? vendor.earningsSplit > 1
        ? vendor.earningsSplit / 100
        : vendor.earningsSplit
      : 0.6;
  const vendorShare = stats.revenue * split;

  return {
    vendor: {
      _id: vendor._id,
      name: vendor.name,
      phone: vendor.phone || "",
      email: vendor.email || "",
      city: vendor.city || "",
      services: Array.isArray(vendor.services) ? vendor.services : [],
      heavyDuty: !!vendor.heavyDuty,
      earningsSplit: split,
      complianceStatus: vendor.complianceStatus || "pending",
      compliance,
      complianceOverride: vendor.complianceOverride === true,
      activity: buildVendorActivity(vendor),
    },
    stats: {
      ...stats,
      vendorShare,
      serviceFees: stats.commission,
    },
    jobs: {
      recent: jobs.slice(0, 20),
      active: jobs.filter((job) => job.status !== "Completed").slice(0, 20),
    },
    documents: docs.map(serializeDocument),
  };
};

router.get("/vendors/:vendorId", async (req, res, next) => {
  try {
    const vendorId = sanitizeId(req.params.vendorId);
    if (!vendorId) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const detail = await buildVendorDetail(vendor);
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.patch("/vendors/:vendorId", async (req, res, next) => {
  try {
    const vendorId = sanitizeId(req.params.vendorId);
    if (!vendorId) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const payload = req.body || {};
    const update = {};

    if (payload.name !== undefined) update.name = String(payload.name).trim();
    if (payload.phone !== undefined) update.phone = String(payload.phone).trim();
    if (payload.email !== undefined) update.email = String(payload.email || "").trim();
    if (payload.city !== undefined) update.city = String(payload.city || "").trim();
    if (payload.services !== undefined) {
      update.services = Array.isArray(payload.services)
        ? payload.services.map((svc) => String(svc).trim()).filter(Boolean)
        : [];
    }
    if (payload.heavyDuty !== undefined) {
      update.heavyDuty = toBoolean(payload.heavyDuty);
    }
    if (payload.earningsSplit !== undefined) {
      const raw = Number(payload.earningsSplit);
      if (Number.isFinite(raw) && raw > 0) {
        update.earningsSplit = raw > 1 ? Math.min(raw / 100, 0.95) : Math.min(raw, 0.95);
      }
    }
    if (payload.active !== undefined) {
      update.active = toBoolean(payload.active);
    }
    if (payload.updatesPaused !== undefined) {
      update.updatesPaused = toBoolean(payload.updatesPaused);
    }
    let overrideProvided = false;
    let overrideValue = null;
    if (payload.complianceOverride !== undefined) {
      overrideProvided = true;
      overrideValue = toBoolean(payload.complianceOverride);
      update.complianceOverride = overrideValue;
      if (overrideValue) {
        update["compliance.allowed"] = true;
        update["compliance.override"] = true;
      } else {
        update["compliance.override"] = false;
      }
    }
    if (payload.lat !== undefined) {
      const lat = toFiniteNumber(payload.lat);
      if (Number.isFinite(lat)) update.lat = lat;
    }
    if (payload.lng !== undefined) {
      const lng = toFiniteNumber(payload.lng);
      if (Number.isFinite(lng)) update.lng = lng;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "No updates supplied" });
    }

    let vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { $set: update },
      { new: true }
    ).lean();

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    if (overrideProvided && overrideValue === false) {
      await refreshVendorCompliance(vendorId);
      vendor = await Vendor.findById(vendorId).lean();
    }

    broadcastVendorUpdate(vendor);

    const detail = await buildVendorDetail(vendor);
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.delete("/vendors/:vendorId", async (req, res, next) => {
  try {
    const vendorId = sanitizeId(req.params.vendorId);
    if (!vendorId) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const removed = await Vendor.findByIdAndDelete(vendorId).lean();
    if (!removed) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    broadcastVendorRemoval(vendorId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/push/subscribe", requireAdminAuth, async (req, res, next) => {
  try {
    if (!isPushConfigured()) {
      return res
        .status(503)
        .json({ message: "Push messaging is not configured." });
    }

    const { subscription, meta } = req.body || {};
    if (
      !subscription ||
      !subscription.endpoint ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return res.status(400).json({ message: "Invalid push subscription." });
    }

    const doc = await registerAdminSubscription(req.adminId || null, {
      subscription,
      meta,
    });

    res.status(201).json({ ok: true, id: doc._id });
  } catch (error) {
    next(error);
  }
});

router.post("/push/unsubscribe", requireAdminAuth, async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ message: "Endpoint is required." });
    }
    await unregisterSubscription(endpoint);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
