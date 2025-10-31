// server/src/routes/bids.js
import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import Bid from "../models/Bid.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import { notifySMS } from "../lib/notifier.js";
import { getClientBaseUrl, resolveClientBaseUrl } from "../lib/clientUrl.js";
import { sendCustomerPushNotifications } from "../lib/push.js";
import { z } from "zod";
import { validate } from "../lib/validation.js";
import {
  bidSubmissionCounter,
  bidSubmissionDuration,
  bidSelectionCounter,
  bidSelectionDuration,
} from "../lib/metrics.js";

const router = Router();

const defaultClientBase = getClientBaseUrl();

// helpers
const isObjId = (s) => mongoose.isValidObjectId(s);
const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
const toInt = (v) => Number.parseInt(v, 10);
const toNum = (v) => Number(v);
const clamp = (n, lo, hi) =>
  Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : NaN;
const normalizePhone = (input = "") => {
  const str = String(input || "").trim();
  if (!str) return "";
  if (str.startsWith("+")) {
    return `+${str.slice(1).replace(/\D+/g, "")}`;
  }
  return str.replace(/\D+/g, "");
};

const bidSubmissionSchema = z.object({
  vendorName: z
    .string({
      required_error: "vendorName is required",
      invalid_type_error: "vendorName must be a string",
    })
    .trim()
    .min(1, "vendorName is required")
    .max(120, "vendorName too long"),
  vendorPhone: z
    .string({
      required_error: "vendorPhone is required",
      invalid_type_error: "vendorPhone must be a string",
    })
    .trim()
    .min(5, "Enter a valid phone number")
    .max(32, "vendorPhone too long"),
  etaMinutes: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) =>
      val === undefined || val === null || val === "" ? undefined : Number(val)
    ),
  price: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) =>
      val === undefined || val === null || val === "" ? undefined : Number(val)
    ),
});

const bidSelectionParamsSchema = z.object({
  bidId: z
    .string({
      required_error: "bidId is required",
      invalid_type_error: "bidId must be a string",
    })
    .refine((value) => mongoose.isValidObjectId(value), {
      message: "Invalid bid id",
    }),
});

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
  const endTimer = bidSubmissionDuration.startTimer();
  try {
    const token = String(req.params.vendorToken || "");
    const job = await Job.findOne({ vendorToken: token });
    if (!job || !job.biddingOpen) {
      bidSubmissionCounter.labels("job_not_open").inc();
      endTimer();
      return res.status(404).json({ message: "Bidding closed" });
    }

    const validation = validate(bidSubmissionSchema, req.body || {});
    if (!validation.success) {
      bidSubmissionCounter.labels("validation_error").inc();
      endTimer();
      return res.status(400).json(validation.error);
    }
    const {
      vendorName,
      vendorPhone,
      etaMinutes: parsedEtaMinutes,
      price: parsedPrice,
    } = validation.data;

    const normalizedPhone = normalizePhone(vendorPhone);
    if (!isNonEmpty(normalizedPhone)) {
      return res
        .status(400)
        .json({ message: "Enter a valid phone number" });
    }
    const trimmedName = vendorName.trim();

    const isFixed = job.bidMode === "fixed";
    const eta = clamp(toInt(parsedEtaMinutes), 1, 720); // up to 12h
    if (!Number.isFinite(eta)) {
      return res.status(400).json({ message: "Invalid ETA or price" });
    }

    let pr;
    if (isFixed) {
      const jobQuoted = Number(job.quotedPrice);
      pr = Number.isFinite(jobQuoted) ? jobQuoted : 0;
    } else {
      pr = clamp(toNum(parsedPrice), 0, 1_000_000);
    if (!Number.isFinite(pr)) {
      bidSubmissionCounter.labels("validation_error").inc();
      endTimer();
      return res.status(400).json({ message: "Invalid ETA or price" });
    }
    }

    // Upsert: if this vendor (phone) already bid on this job, update it
    const bid = await Bid.findOneAndUpdate(
      { jobId: job._id, vendorPhone: normalizedPhone },
      {
        $set: {
          jobId: job._id,
          vendorName: trimmedName,
          vendorPhone: normalizedPhone,
          etaMinutes: eta,
          price: pr,
        },
      },
      { new: true, upsert: true }
    ).lean();

    if (normalizedPhone) {
      let vendorDoc = await Vendor.findOne({ phone: normalizedPhone });
      if (!vendorDoc) {
        try {
          vendorDoc = await Vendor.create({
            name: trimmedName || "Vendor",
            phone: normalizedPhone,
            active: true,
            services: job.serviceType ? [job.serviceType] : [],
            baseAddress: job.pickupAddress || undefined,
          });
        } catch (err) {
          if (err?.code === 11000) {
            vendorDoc = await Vendor.findOne({ phone: normalizedPhone });
          } else {
            throw err;
          }
        }
      } else {
        let shouldSaveVendor = false;
        if (
          trimmedName &&
          trimmedName.length &&
          (!vendorDoc.name || vendorDoc.name === vendorDoc.phone)
        ) {
          vendorDoc.name = trimmedName;
          shouldSaveVendor = true;
        }
        if (
          job.serviceType &&
          (!Array.isArray(vendorDoc.services) ||
            !vendorDoc.services.includes(job.serviceType))
        ) {
          vendorDoc.services = Array.isArray(vendorDoc.services)
            ? [...new Set([...vendorDoc.services, job.serviceType])]
            : [job.serviceType];
          shouldSaveVendor = true;
        }
        if (vendorDoc.phone !== normalizedPhone) {
          vendorDoc.phone = normalizedPhone;
          shouldSaveVendor = true;
        }
        if (shouldSaveVendor) {
          await vendorDoc.save();
        }
      }
      if (
        vendorDoc &&
        bid &&
        (!bid.vendorId || String(bid.vendorId) !== String(vendorDoc._id))
      ) {
        await Bid.updateOne(
          { _id: bid._id },
          { $set: { vendorId: vendorDoc._id } }
        ).catch(() => {});
      }
    }

    // Notify customer (optional, best-effort)
    try {
      const cust = await Customer.findById(job.customerId).lean();
      const base = resolveClientBaseUrl(req) || defaultClientBase;
      const customerRoute = job.customerToken
        ? `/choose/${job.customerToken}`
        : `/status/${job._id}`;
      const customerUrl = `${base.replace(/\/$/, "")}${customerRoute}`;
      const priceLabel = Number.isFinite(pr) ? pr : 0;
      const messageBody = isFixed
        ? `New ETA: ${bid.vendorName} - ETA ${bid.etaMinutes}m. Fixed price $${priceLabel}`
        : `New bid: ${bid.vendorName} - $${bid.price}, ETA ${bid.etaMinutes}m`;

      if (cust?.phone && job.customerToken) {
        const viewLink = `${base.replace(/\/$/, "")}/choose/${job.customerToken}`;
        const smsMessage = `${messageBody}. View: ${viewLink}`;
        await notifySMS(cust.phone, smsMessage, job._id);
      }

      await sendCustomerPushNotifications([
        {
          customerId: job.customerId,
          jobId: job._id,
          title: "New bid received",
          body: messageBody,
          severity: "info",
          meta: {
            role: "customer",
            jobId: job._id,
            kind: "bid",
            route: customerRoute,
            absoluteUrl: customerUrl,
            dedupeKey: `customer:job:${job._id}:bid:${bid._id}`,
          },
        },
      ]);
    } catch {
      /* best-effort */
    }
    res.status(201).json(bid);
    bidSubmissionCounter.labels("success").inc();
    endTimer();
  } catch (e) {
    bidSubmissionCounter.labels("error").inc();
    endTimer();
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
// ----------------------------------------------------------
// Customer selects a bid (locks job, closes bidding, mints vendorAcceptedToken)
// POST /api/bids/:bidId/select
// ----------------------------------------------------------
router.post("/:bidId/select", async (req, res, next) => {
  const endTimer = bidSelectionDuration.startTimer();
  try {
    const validation = validate(bidSelectionParamsSchema, req.params || {});
    if (!validation.success) {
      bidSelectionCounter.labels("validation_error").inc();
      endTimer();
      return res.status(400).json(validation.error);
    }
    const { bidId } = validation.data;

    // Load bid (lean is fine here)
    const bid = await Bid.findById(bidId).lean();
    if (!bid) {
      bidSelectionCounter.labels("not_found").inc();
      endTimer();
      return res.status(404).json({ message: "Bid not found" });
    }

    // Load job (we'll mutate and save)
    const job = await Job.findById(bid.jobId);
    if (!job) {
      bidSelectionCounter.labels("not_found").inc();
      endTimer();
      return res.status(404).json({ message: "Job not found" });
    }

    // Prevent double-selection
    if (job.selectedBidId && String(job.selectedBidId) !== String(bid._id)) {
      bidSelectionCounter.labels("conflict").inc();
      endTimer();
      return res
        .status(409)
        .json({ message: "Another bid has already been selected" });
    }

    // Apply selection
    job.selectedBidId = bid._id;
    const trimmedVendorName = String(bid.vendorName || "").trim();
    const normalizedBidPhone = normalizePhone(bid.vendorPhone);
    job.vendorName = trimmedVendorName || bid.vendorName || job.vendorName;
    job.vendorPhone = normalizedBidPhone || bid.vendorPhone || job.vendorPhone;
    job.status = "Assigned";
    job.biddingOpen = false;

    // Compute final price
    const quoted = Number(job.quotedPrice);
    if (job.bidMode === "fixed") {
      job.finalPrice = Number.isFinite(quoted) ? quoted : Number(bid.price) || 0;
    } else {
      job.finalPrice = Number(bid.price) || 0;
    }

    // Ensure vendor linkage exists
    let vendorDoc = null;
    if (job.vendorId) {
      vendorDoc = await Vendor.findById(job.vendorId);
    }
    if (!vendorDoc && normalizedBidPhone) {
      vendorDoc = await Vendor.findOne({ phone: normalizedBidPhone });
    }
    if (!vendorDoc && bid.vendorPhone && bid.vendorPhone !== normalizedBidPhone) {
      vendorDoc = await Vendor.findOne({ phone: bid.vendorPhone });
    }

    if (!vendorDoc && normalizedBidPhone) {
      try {
        vendorDoc = await Vendor.create({
          name: trimmedVendorName || "Vendor",
          phone: normalizedBidPhone,
          active: true,
          services: job.serviceType ? [job.serviceType] : [],
          baseAddress: job.pickupAddress || undefined,
        });
      } catch (err) {
        if (err?.code === 11000) {
          vendorDoc = await Vendor.findOne({ phone: normalizedBidPhone });
        } else {
          throw err;
        }
      }
    } else if (vendorDoc) {
      let shouldSaveVendor = false;
      if (
        trimmedVendorName &&
        trimmedVendorName.length &&
        (!vendorDoc.name || vendorDoc.name === vendorDoc.phone)
      ) {
        vendorDoc.name = trimmedVendorName;
        shouldSaveVendor = true;
      }
      if (
        job.serviceType &&
        (!Array.isArray(vendorDoc.services) ||
          !vendorDoc.services.includes(job.serviceType))
      ) {
        vendorDoc.services = Array.isArray(vendorDoc.services)
          ? [...new Set([...vendorDoc.services, job.serviceType])]
          : [job.serviceType];
        shouldSaveVendor = true;
      }
      if (normalizedBidPhone && vendorDoc.phone !== normalizedBidPhone) {
        vendorDoc.phone = normalizedBidPhone;
        shouldSaveVendor = true;
      }
      if (shouldSaveVendor) {
        await vendorDoc.save();
      }
    }

    if (vendorDoc) {
      job.vendorId = vendorDoc._id;
      job.vendorName = trimmedVendorName || vendorDoc.name || job.vendorName;
      job.vendorPhone = vendorDoc.phone || job.vendorPhone;
      if (
        bid &&
        (!bid.vendorId || String(bid.vendorId) !== String(vendorDoc._id))
      ) {
        await Bid.updateOne(
          { _id: bid._id },
          { $set: { vendorId: vendorDoc._id } }
        ).catch(() => {});
      }
    }

    // Ensure vendorAcceptedToken exists
    if (!job.vendorAcceptedToken) {
      job.vendorAcceptedToken = crypto.randomBytes(16).toString("hex");
    }

    await job.save();

    // Build client URLs (FIX: define baseClient properly)
    const baseClient =
      (resolveClientBaseUrl(req) || defaultClientBase || "").replace(/\/$/, "");
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
      // Optional: push notifications (reusing your helper)
      await sendCustomerPushNotifications?.([
        {
          customerId: job.customerId,
          jobId: job._id,
          title: "Bid selected",
          body: `Vendor assigned: ${job.vendorName}`,
          severity: "success",
          meta: {
            role: "customer",
            jobId: job._id,
            kind: "bid_selected",
            route: `/status/${job._id}`,
            absoluteUrl: statusUrl,
            dedupeKey: `customer:job:${job._id}:bid_selected:${bid._id}`,
          },
        },
      ]);
    } catch {
      /* ignore best-effort notify errors */
    }

    // Consistent, UI-friendly response
    return res.json({
      ok: true,
      jobId: job._id,
      selectedBidId: job.selectedBidId,
      status: job.status,
      finalPrice: job.finalPrice,
      vendor: { name: job.vendorName, phone: job.vendorPhone },
      links: { vendorPortal, statusUrl },
    });
    bidSelectionCounter.labels("success").inc();
    endTimer();
  } catch (e) {
    bidSelectionCounter.labels("error").inc();
    endTimer();
    next(e);
  }
});


export default router;
