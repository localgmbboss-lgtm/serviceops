// server/src/routes/bids.js
import { Router } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import Job from "../models/Jobs.js";
import Bid from "../models/Bid.js";
import Customer from "../models/Customer.js";
import { notifySMS } from "../lib/notifier.js";
import { getClientBaseUrl, resolveClientBaseUrl } from "../lib/clientUrl.js";

const router = Router();

const defaultClientBase = getClientBaseUrl();

// helpers
const isObjId = (s) => mongoose.isValidObjectId(s);
const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
const toInt = (v) => Number.parseInt(v, 10);
const toNum = (v) => Number(v);
const clamp = (n, lo, hi) =>
  Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : NaN;

// ----------------------------------------------------------
// Vendor preview (minimal job info for bidding)
// GET /api/bids/job/:vendorToken
// ----------------------------------------------------------
router.get("/job/:vendorToken", async (req, res, next) => {
  try {
    const token = String(req.params.vendorToken || "");
    const job = await Job.findOne({ vendorToken: token }).lean();
    if (!job || !job.biddingOpen) {
      return res
        .status(404)
        .json({ message: "Job not found or bidding closed" });
    }
    res.json({
      jobId: job._id,
      serviceType: job.serviceType,
      pickupAddress: job.pickupAddress,
      dropoffAddress: job.dropoffAddress || null,
      heavyDuty: !!job.heavyDuty,
      quotedPrice: Number.isFinite(job.quotedPrice) ? job.quotedPrice : 0,
      bidMode: job.bidMode || "open",
    });
  } catch (e) {
    next(e);
  }
});

// ----------------------------------------------------------
// Vendor submits or updates a bid (idempotent per job+phone)
// POST /api/bids/:vendorToken
// body: { vendorName, vendorPhone, etaMinutes, price }
// ----------------------------------------------------------
router.post("/:vendorToken", async (req, res, next) => {
  try {
    const token = String(req.params.vendorToken || "");
    const job = await Job.findOne({ vendorToken: token });
    if (!job || !job.biddingOpen) {
      return res.status(404).json({ message: "Bidding closed" });
    }

    const { vendorName, vendorPhone, etaMinutes, price } = req.body || {};
    if (!isNonEmpty(vendorName) || !isNonEmpty(vendorPhone)) {
      return res
        .status(400)
        .json({ message: "vendorName and vendorPhone required" });
    }

    const isFixed = job.bidMode === "fixed";
    const eta = clamp(toInt(etaMinutes), 1, 720); // up to 12h
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

    // Upsert: if this vendor (phone) already bid on this job, update it
    const bid = await Bid.findOneAndUpdate(
      { jobId: job._id, vendorPhone: vendorPhone.trim() },
      {
        $set: {
          jobId: job._id,
          vendorName: vendorName.trim(),
          vendorPhone: vendorPhone.trim(),
          etaMinutes: eta,
          price: pr,
        },
      },
      { new: true, upsert: true }
    ).lean();

    // Notify customer (optional, best-effort)
    try {
      const cust = await Customer.findById(job.customerId).lean();
      if (cust?.phone && job.customerToken) {
        const viewLink = `${base}/choose/${job.customerToken}`;
        const priceLabel = Number.isFinite(pr) ? pr : 0;
        const linkSuffix = viewLink ? ` . View: ${viewLink}` : "";
        const smsMessage = isFixed
          ? `New ETA: ${bid.vendorName} - ETA ${bid.etaMinutes}m. Fixed price $${priceLabel}${linkSuffix}`
          : `New bid: ${bid.vendorName} - $${bid.price}, ETA ${bid.etaMinutes}m${linkSuffix}`;
        await notifySMS(cust.phone, smsMessage, job._id);
      }
    } catch {
      /* best-effort */
    }
    res.status(201).json(bid);
  } catch (e) {
    next(e);
  }
});

// ----------------------------------------------------------
// Customer reads bids (token-based)
// GET /api/bids/list/:customerToken
// ----------------------------------------------------------
router.get("/list/:customerToken", async (req, res, next) => {
  try {
    const token = String(req.params.customerToken || "");
    const job = await Job.findOne({ customerToken: token }).lean();
    if (!job) return res.status(404).json({ message: "Invalid link" });

    const bids = await Bid.find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      jobId: job._id,
      job: {
        serviceType: job.serviceType,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress || null,
        heavyDuty: !!job.heavyDuty,
        status: job.status,
        biddingOpen: !!job.biddingOpen,
        selectedBidId: job.selectedBidId || null,
      },
      bids: bids.map((b) => ({
        _id: b._id,
        vendorName: b.vendorName,
        vendorPhone: b.vendorPhone,
        price: b.price,
        etaMinutes: b.etaMinutes,
        createdAt: b.createdAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ----------------------------------------------------------
// Customer selects a bid (locks job, closes bidding, mints vendorAcceptedToken)
// POST /api/bids/:bidId/select
// ----------------------------------------------------------
router.post("/:bidId/select", async (req, res, next) => {
  try {
    const { bidId } = req.params;
    if (!isObjId(bidId))
      return res.status(400).json({ message: "Invalid bid id" });

    const bid = await Bid.findById(bidId).lean();
    if (!bid) return res.status(404).json({ message: "Bid not found" });

    const job = await Job.findById(bid.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // if already selected another bid, block
    if (job.selectedBidId && String(job.selectedBidId) !== String(bid._id)) {
      return res
        .status(409)
        .json({ message: "Another bid has already been selected" });
    }

    job.selectedBidId = bid._id;
    job.vendorName = bid.vendorName;
    job.vendorPhone = bid.vendorPhone;
    job.status = "Assigned";
    job.biddingOpen = false;
    job.finalPrice = job.bidMode === "fixed"
      ? (Number.isFinite(job.quotedPrice) ? job.quotedPrice : bid.price)
      : bid.price;

    if (!job.vendorAcceptedToken) {
      job.vendorAcceptedToken = crypto.randomBytes(16).toString("hex");
    }

    await job.save();

    const vendorPortal = `${baseClient}/vendor/${job.vendorAcceptedToken}`;
    const statusUrl = `${baseClient}/status/${job._id}`;

    // Best-effort notifications
    try {
      if (job.vendorPhone) {
        await notifySMS(
          job.vendorPhone,
          `Your bid was accepted. Open job: ${vendorPortal}`,
          job._id
        );
      }
      const cust = await Customer.findById(job.customerId).lean();
      if (cust?.phone) {
        await notifySMS(
          cust.phone,
          `Vendor assigned: ${job.vendorName}. Track: ${statusUrl}`,
          job._id
        );
      }
    } catch {
      /* ignore */
    }

    res.json({ ok: true, jobId: job._id, vendorPortal, statusUrl });
  } catch (e) {
    next(e);
  }
});

export default router;
