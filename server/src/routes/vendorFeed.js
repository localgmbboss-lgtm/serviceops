// server/src/routes/vendorFeed.js
import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import Bid from "../models/Bid.js";
import Vendor from "../models/Vendor.js";
import { refreshVendorCompliance } from "../lib/compliance.js";
import { requireVendorAuth } from "./vendorAuth.js";
import VendorNotification from "../models/VendorNotification.js";
import {
  isPushConfigured,
  registerVendorSubscription,
  unregisterSubscription,
} from "../lib/push.js";

const router = Router();

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;
const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return NaN;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.min(Math.max(value, min), max);
};

const toNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};

const toInt = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : NaN;
};

const normalizePhone = (input) => {
  if (!input) return "";
  const str = String(input).trim();
  if (!str) return "";
  if (str.startsWith("+")) {
    return `+${str.slice(1).replace(/\D+/g, "")}`;
  }
  return str.replace(/\D+/g, "");
};

const distanceKm = (lat1, lng1, lat2, lng2) => {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

async function loadVendorWithCompliance(vendorId) {
  if (!vendorId) return null;
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) return null;

  if (vendor.complianceOverride === true) {
    if (!vendor.compliance) vendor.compliance = {};
    vendor.compliance.allowed = true;
    vendor.compliance.override = true;
    return vendor;
  }

  if (vendor?.compliance?.allowed || vendor?.complianceStatus === "compliant") {
    return vendor;
  }

  try {
    await refreshVendorCompliance(vendor._id);
    const refreshed = await Vendor.findById(vendorId).lean();
    return refreshed || vendor;
  } catch (error) {
    return vendor;
  }
}
router.get("/open", requireVendorAuth, async (req, res, next) => {
  const vendor = await loadVendorWithCompliance(req.vendorId);
  if (!vendor) return res.status(401).json({ message: "Vendor not found" });
  const vendorPhone = normalizePhone(vendor.phone);

  if (!vendor.compliance?.allowed) {
    return res.status(403).json({
      message: "Submit required compliance documents to receive jobs.",
      complianceStatus: vendor.complianceStatus || "pending",
      compliance: vendor.compliance || {
        allowed: false,
        enforcement: "submission",
        missing: [],
      },
    });
  }

  const find = { biddingOpen: true, status: { $ne: "Completed" } };
  const jobs = await Job.find(find).sort({ created: -1 }).limit(50).lean();

  const myBids = await Bid.find(
    {
      jobId: { $in: jobs.map((j) => j._id) },
      $or: [
        { vendorId: vendor._id },
        ...(vendorPhone ? [{ vendorPhone: vendorPhone }] : []),
      ],
    },
    "jobId"
  ).lean();
  const bidOn = new Set(myBids.map((b) => String(b.jobId)));

  const avgSpeedKmh = 55;
  const vendorLat = Number.isFinite(vendor.lat) ? vendor.lat : null;
  const vendorLng = Number.isFinite(vendor.lng) ? vendor.lng : null;

  const jobsWithDistance = jobs.map((j) => {
    const distKm =
      vendorLat === null || vendorLng === null
        ? null
        : distanceKm(vendorLat, vendorLng, j.pickupLat, j.pickupLng);
    const suggestedEtaMinutes =
      distKm === null
        ? null
        : Math.max(10, Math.ceil((distKm / avgSpeedKmh) * 60 + 5));

    return {
      _id: j._id,
      serviceType: j.serviceType,
      pickupAddress: j.pickupAddress,
      pickupLat: Number.isFinite(j.pickupLat) ? j.pickupLat : null,
      pickupLng: Number.isFinite(j.pickupLng) ? j.pickupLng : null,
      dropoffAddress: j.dropoffAddress || null,
      dropoffLat: Number.isFinite(j.dropoffLat) ? j.dropoffLat : null,
      dropoffLng: Number.isFinite(j.dropoffLng) ? j.dropoffLng : null,
      notes: j.notes || null,
      heavyDuty: !!j.heavyDuty,
      quotedPrice: Number.isFinite(j.quotedPrice) ? j.quotedPrice : 0,
      bidMode: j.bidMode || "open",
      created: j.created,
      guestRequest: !!j.guestRequest,
      canBid: !bidOn.has(String(j._id)),
      distanceKm: distKm,
      suggestedEtaMinutes,
    };
  });

  res.json(jobsWithDistance);
});

router.post("/bid", requireVendorAuth, async (req, res, next) => {
  const { jobId, etaMinutes, price } = req.body || {};
  if (!mongoose.isValidObjectId(jobId))
    return res.status(400).json({ message: "Invalid jobId" });

  const job = await Job.findById(jobId);
  if (!job || !job.biddingOpen)
    return res.status(404).json({ message: "Bidding closed" });

  const vendor = await loadVendorWithCompliance(req.vendorId);
  if (!vendor) return res.status(401).json({ message: "Vendor not found" });
  const vendorPhone = normalizePhone(vendor.phone);

  if (!vendor.compliance?.allowed) {
    return res.status(403).json({
      message: "Submit required compliance documents before bidding.",
      complianceStatus: vendor.complianceStatus || "pending",
      compliance: vendor.compliance || {
        allowed: false,
        enforcement: "submission",
        missing: [],
      },
    });
  }

  const isFixed = job.bidMode === "fixed";
  const eta = clamp(toInt(etaMinutes), 1, 720);
  if (!Number.isFinite(eta)) {
    return res.status(400).json({ message: "Invalid ETA or price" });
  }

  let pr;
  if (isFixed) {
    const jobQuoted = Number(job.quotedPrice);
    pr = Number.isFinite(jobQuoted) ? jobQuoted : 0;
  } else {
    pr = clamp(toNum(price), 0, 1_000_000);
    if (!Number.isFinite(pr)) {
      return res.status(400).json({ message: "Invalid ETA or price" });
    }
  }

  const bid = await Bid.findOneAndUpdate(
    {
      jobId: job._id,
      $or: [
        { vendorId: vendor._id },
        ...(vendorPhone ? [{ vendorPhone: vendorPhone }] : []),
      ],
    },
    {
      $set: {
        jobId: job._id,
        vendorId: vendor._id,
        vendorName: vendor.name,
        vendorPhone: vendorPhone || null,
        etaMinutes: eta,
        price: pr,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  res.status(201).json({
    _id: bid._id,
    jobId: bid.jobId,
    vendorName: bid.vendorName,
    vendorPhone: bid.vendorPhone,
    etaMinutes: bid.etaMinutes,
    price: bid.price,
    createdAt: bid.createdAt,
  });
});

router.get("/assigned", requireVendorAuth, async (req, res, next) => {
  const vendor = await loadVendorWithCompliance(req.vendorId);
  if (!vendor) return res.status(401).json({ message: "Vendor not found" });

  const vendorPhone = normalizePhone(vendor.phone);

  const jobs = await Job.find({
    $or: [
      { vendorId: vendor._id },
      ...(vendorPhone ? [{ vendorPhone: vendorPhone }] : []),
    ],
  })
    .sort({ created: -1 })
    .limit(100)
    .lean();

  const vendorLat = Number.isFinite(vendor.lat) ? vendor.lat : null;
  const vendorLng = Number.isFinite(vendor.lng) ? vendor.lng : null;

  const jobsWithDistance = jobs.map((j) => ({
    _id: j._id,
    serviceType: j.serviceType,
    pickupAddress: j.pickupAddress,
    pickupLat: Number.isFinite(j.pickupLat) ? j.pickupLat : null,
    pickupLng: Number.isFinite(j.pickupLng) ? j.pickupLng : null,
    dropoffAddress: j.dropoffAddress || null,
    dropoffLat: Number.isFinite(j.dropoffLat) ? j.dropoffLat : null,
    dropoffLng: Number.isFinite(j.dropoffLng) ? j.dropoffLng : null,
    notes: j.notes || null,
    heavyDuty: !!j.heavyDuty,
    quotedPrice: Number.isFinite(j.quotedPrice) ? j.quotedPrice : 0,
    bidMode: j.bidMode || "open",
    status: j.status || "Unassigned",
    created: j.created,
    guestRequest: !!j.guestRequest,
    canBid: false,
    distanceKm:
      vendorLat === null || vendorLng === null
        ? null
        : distanceKm(vendorLat, vendorLng, j.pickupLat, j.pickupLng),
  }));

  res.json(jobsWithDistance);
});

router.get("/jobs/:jobId", requireVendorAuth, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job id" });
    }

    const vendor = await loadVendorWithCompliance(req.vendorId);
    if (!vendor) return res.status(401).json({ message: "Vendor not found" });

    const job = await Job.findById(jobId).lean();
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const vendorPhone = normalizePhone(vendor.phone);
    const jobVendorPhone = normalizePhone(job.vendorPhone);
    const matchesId =
      job.vendorId && String(job.vendorId) === String(vendor._id);
    const matchesPhone =
      !matchesId && vendorPhone && vendorPhone === jobVendorPhone;

    if (!matchesId && !matchesPhone) {
      return res.status(403).json({ message: "Job is not assigned to you." });
    }

    const vendorLat = Number.isFinite(vendor.lat) ? vendor.lat : null;
    const vendorLng = Number.isFinite(vendor.lng) ? vendor.lng : null;

    const dist =
      vendorLat === null || vendorLng === null
        ? null
        : distanceKm(vendorLat, vendorLng, job.pickupLat, job.pickupLng);

    res.json({
      _id: job._id,
      serviceType: job.serviceType,
      pickupAddress: job.pickupAddress,
      pickupLat: Number.isFinite(job.pickupLat) ? job.pickupLat : null,
      pickupLng: Number.isFinite(job.pickupLng) ? job.pickupLng : null,
      dropoffAddress: job.dropoffAddress || null,
      dropoffLat: Number.isFinite(job.dropoffLat) ? job.dropoffLat : null,
      dropoffLng: Number.isFinite(job.dropoffLng) ? job.dropoffLng : null,
      notes: job.notes || null,
      internalNotes: job.internalNotes || null,
      heavyDuty: !!job.heavyDuty,
      quotedPrice: Number.isFinite(job.quotedPrice) ? job.quotedPrice : 0,
      bidMode: job.bidMode || "open",
      status: job.status || "Unassigned",
      created: job.created,
      assignedAt: job.assignedAt || null,
      customerName: job.customerName || null,
      customerPhone: job.customerPhone || null,
      contactName: job.contactName || null,
      contactPhone: job.contactPhone || null,
      vehicleMake: job.vehicleMake || null,
      vehicleModel: job.vehicleModel || null,
      vehicleColor: job.vehicleColor || null,
      media: Array.isArray(job.media) ? job.media : [],
      distanceKm: dist,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/alerts", requireVendorAuth, async (req, res, next) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 20;

    const alerts = await VendorNotification.find({
      vendorId: req.vendorId,
      read: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (alerts.length > 0) {
      const ids = alerts.map((doc) => doc._id);
      await VendorNotification.updateMany(
        { _id: { $in: ids }, read: { $ne: true } },
        { $set: { read: true, readAt: new Date() } }
      );
    }

    res.json(
      alerts.map((doc) => ({
        id: doc._id.toString(),
        jobId: doc.jobId ? doc.jobId.toString() : null,
        title: doc.title,
        body: doc.body,
        severity: doc.severity || "info",
        source: doc.source || "system",
        createdAt: doc.createdAt,
        meta: doc.meta || {},
        read: false,
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/push/subscribe", requireVendorAuth, async (req, res, next) => {
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

    const doc = await registerVendorSubscription(req.vendorId, {
      subscription,
      meta,
    });

    res.status(201).json({ ok: true, id: doc._id });
  } catch (error) {
    next(error);
  }
});

router.post("/push/unsubscribe", requireVendorAuth, async (req, res, next) => {
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

router.patch(
  "/jobs/:jobId/status",
  requireVendorAuth,
  async (req, res, next) => {
    const { jobId } = req.params;
    const { status } = req.body || {};
    if (!mongoose.isValidObjectId(jobId))
      return res.status(400).json({ message: "Invalid job id" });
    if (!["OnTheWay", "Arrived", "Completed"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const v = await Vendor.findById(req.vendorId).lean();
    if (!v) return res.status(401).json({ message: "Vendor not found" });
    const vendorPhone = normalizePhone(v.phone);

    const job = await Job.findOne({
      _id: jobId,
      $or: [
        { vendorId: v._id },
        ...(vendorPhone ? [{ vendorPhone: vendorPhone }] : []),
      ],
    });
    if (!job) return res.status(404).json({ message: "Job not found" });

    job.status = status;
    if (status === "Completed" && !job.completed) job.completed = new Date();
    await job.save();

    res.json({ ok: true, jobId: job._id, status: job.status });
  }
);

export default router;
