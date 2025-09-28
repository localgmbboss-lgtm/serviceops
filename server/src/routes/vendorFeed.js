// server/src/routes/vendorFeed.js
import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import Bid from "../models/Bid.js";
import Vendor from "../models/Vendor.js";
import { requireVendorAuth } from "./vendorAuth.js";

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

router.get("/open", requireVendorAuth, async (req, res, next) => {
  const v = await Vendor.findById(req.vendorId).lean();
  if (!v) return res.status(401).json({ message: "Vendor not found" });

  const find = { biddingOpen: true, status: { $ne: "Completed" } };
  const jobs = await Job.find(find).sort({ created: -1 }).limit(50).lean();

  const myBids = await Bid.find(
    {
      jobId: { $in: jobs.map((j) => j._id) },
      $or: [
        { vendorId: v._id },
        ...(v.phone ? [{ vendorPhone: v.phone }] : []),
      ],
    },
    "jobId"
  ).lean();
  const bidOn = new Set(myBids.map((b) => String(b.jobId)));

  const avgSpeedKmh = 55;

  const jobsWithDistance = jobs.map((j) => {
    const distKm = distanceKm(v.lat, v.lng, j.pickupLat, j.pickupLng);
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

  const v = await Vendor.findById(req.vendorId).lean();
  if (!v) return res.status(401).json({ message: "Vendor not found" });

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
        { vendorId: v._id },
        ...(v.phone ? [{ vendorPhone: v.phone }] : []),
      ],
    },
    {
      $set: {
        jobId: job._id,
        vendorId: v._id,
        vendorName: v.name,
        vendorPhone: v.phone || null,
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
  const v = await Vendor.findById(req.vendorId).lean();
  if (!v) return res.status(401).json({ message: "Vendor not found" });

  const jobs = await Job.find({
    $or: [{ vendorId: v._id }, ...(v.phone ? [{ vendorPhone: v.phone }] : [])],
  })
    .sort({ created: -1 })
    .limit(100)
    .lean();

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
    distanceKm: distanceKm(v.lat, v.lng, j.pickupLat, j.pickupLng),
  }));

  res.json(jobsWithDistance);
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

    const job = await Job.findOne({
      _id: jobId,
      $or: [
        { vendorId: v._id },
        ...(v.phone ? [{ vendorPhone: v.phone }] : []),
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

