// server/src/routes/jobs.js
import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { completeJobWithPayment } from "../lib/jobCompletion.js";
import Job from "../models/Jobs.js";
import Vendor from "../models/Vendor.js"; // Changed from Driver to Vendor
import Customer from "../models/Customer.js";
import { notifySMS } from "../lib/notifier.js";
import { getClientBaseUrl, resolveClientBaseUrl } from "../lib/clientUrl.js";
const router = Router();

const defaultClientBase = getClientBaseUrl();

export const STATUSES = [
  "Unassigned",
  "Assigned",
  "OnTheWay",
  "Arrived",
  "Completed",
];

const ALLOWED_NEXT = {
  Unassigned: ["Assigned"],
  Assigned: ["OnTheWay", "Arrived", "Completed", "Unassigned"],
  OnTheWay: ["Arrived", "Completed"],
  Arrived: ["Completed"],
  Completed: [],
};

const makeToken = () => crypto.randomBytes(16).toString("hex");

const PAYMENT_METHODS = new Set([
  "cash",
  "card",
  "zelle",
  "venmo",
  "bank_transfer",
  "other",
]);

// Build link payload (only includes vendor/customer links if tokens exist)
const linkFor = (job, base = defaultClientBase) => ({
  statusUrl: `${base}/status/${job._id}`,
  ...(job.vendorToken
    ? { vendorLink: `${base}/vendor/${job.vendorToken}` }
    : {}),
  ...(job.customerToken
    ? { customerLink: `${base}/choose/${job.customerToken}` }
    : {}),
});

const assertId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error("Invalid id");
    err.status = 400;
    throw err;
  }
};

// ---------- LIST (optional filters: ?status=...&q=...) ----------
router.get("/", async (req, res, next) => {
  try {
    const { status, q } = req.query || {};
    const find = {};
    if (status && STATUSES.includes(status)) find.status = status;

    if (q && String(q).trim()) {
      const s = String(q).trim();
      find.$or = [
        { serviceType: new RegExp(s, "i") },
        { pickupAddress: new RegExp(s, "i") },
        { dropoffAddress: new RegExp(s, "i") },
        { notes: new RegExp(s, "i") },
      ];
    }

    const items = await Job.find(find).sort({ created: -1 }).lean();
    res.json(items);
  } catch (e) {
    next(e);
  }
});

// ---------- CREATE ----------
router.post("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.customerId)
      return res.status(400).json({ message: "customerId required" });
    if (!body.pickupAddress)
      return res.status(400).json({ message: "pickupAddress required" });

    const vendorId = body.vendorId ? String(body.vendorId).trim() : null;
    let vendorDoc = null;
    if (vendorId) {
      assertId(vendorId);
      vendorDoc = await Vendor.findById(vendorId).lean();
      if (!vendorDoc) {
        return res.status(404).json({ message: "Vendor not found" });
      }
    }

    const quotedPrice = Number(body.quotedPrice) || 0;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    const jobPayload = {
      customerId: body.customerId,
      pickupAddress: body.pickupAddress.trim(),
      dropoffAddress: body.dropoffAddress?.trim() || undefined,
      serviceType: body.serviceType?.trim() || "",
      quotedPrice,
      notes,
      bidMode: body.bidMode === "fixed" ? "fixed" : "open",
      status: "Unassigned",
      priority: body.priority === "urgent" ? "urgent" : "normal",
    };

    if (vendorDoc) {
      jobPayload.vendorId = vendorDoc._id;
      jobPayload.vendorName = vendorDoc.name || null;
      jobPayload.vendorPhone = vendorDoc.phone || null;
      jobPayload.status = "Assigned";
      jobPayload.bidMode = "fixed";
      jobPayload.biddingOpen = false;
      jobPayload.assignedAt = new Date();
      jobPayload.finalPrice =
        Number(body.finalPrice) > 0 ? Number(body.finalPrice) : quotedPrice;
    }

    const job = await Job.create(jobPayload);

    res.status(201).json(job);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);

    const payload = req.body || {};
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ message: "Update payload required" });
    }

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const set = {};
    const unset = {};

    if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
      const normalizedPriority = payload.priority === "urgent" ? "urgent" : "normal";
      set.priority = normalizedPriority;
      if (normalizedPriority === "urgent") {
        set.escalatedAt = job.escalatedAt || new Date();
      } else {
        unset.escalatedAt = "";
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "finalPrice")) {
      const finalPrice = Number(payload.finalPrice);
      if (Number.isFinite(finalPrice)) {
        set.finalPrice = finalPrice;
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
      set.notes = String(payload.notes);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "vendorId")) {
      const vendorId = payload.vendorId;
      if (!vendorId) {
        set.vendorId = null;
        set.vendorName = null;
        set.vendorPhone = null;
        set.vendorAcceptedToken = null;
        set.biddingOpen = true;
      } else {
        if (!mongoose.isValidObjectId(vendorId)) {
          return res.status(400).json({ message: "Invalid vendorId" });
        }
        const vendor = await Vendor.findById(vendorId).lean();
        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }
        set.vendorId = vendor._id;
        set.vendorName = vendor.name || null;
        set.vendorPhone = vendor.phone || null;
        set.biddingOpen = false;
        if (!payload.status) {
          payload.status = "Assigned";
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      const nextStatus = payload.status;
      if (!STATUSES.includes(nextStatus)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const currentStatus = job.status;
      if (nextStatus !== currentStatus) {
        const allowed = new Set(ALLOWED_NEXT[currentStatus] || []);
        const currentIndex = STATUSES.indexOf(currentStatus);
        if (currentIndex > 0) {
          allowed.add(STATUSES[currentIndex - 1]);
        }
        allowed.add(currentStatus);

        if (!allowed.has(nextStatus)) {
          return res
            .status(409)
            .json({ message: `Cannot move job from ${currentStatus} to ${nextStatus}` });
        }

        set.status = nextStatus;
        const now = new Date();
        if (nextStatus === "Assigned" && !job.assignedAt) set.assignedAt = now;
        if (nextStatus === "OnTheWay" && !job.onTheWayAt) set.onTheWayAt = now;
        if (nextStatus === "Arrived" && !job.arrivedAt) set.arrivedAt = now;
        if (nextStatus === "Completed") {
          set.completedAt = job.completedAt || now;
          set.completed = job.completed || now;
        }
        if (nextStatus === "Unassigned") {
          set.vendorId = null;
          set.vendorName = null;
          set.vendorPhone = null;
          set.vendorAcceptedToken = null;
          set.biddingOpen = true;
        }
      }
    }

    if (!Object.keys(set).length && !Object.keys(unset).length) {
      return res.json(job.toObject());
    }

    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;

    await Job.updateOne({ _id: id }, update);
    const refreshed = await Job.findById(id).lean();
    res.json(refreshed);
  } catch (e) {
    next(e);
  }
});

router.post("/guest", async (req, res) => {
  return res
    .status(403)
    .json({ message: "Guest intake is currently disabled." });
});

// ---------- GUEST STATUS (read-only by token) ----------
router.get("/guest/:token", async (req, res) => {
  return res.status(404).json({ message: "Guest tracking is unavailable." });
});

router.post("/:id/complete", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);

    const { amount, method, note, autoCharge } = req.body || {};
    const rawAmount = Number(amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    const paymentMethod = typeof method === "string" && method.trim()
      ? method.trim().toLowerCase()
      : null;
    if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({ message: "Unsupported payment method" });
    }

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const { summary, job: updatedJob, charge } = await completeJobWithPayment(job, {
      amount: rawAmount,
      method: paymentMethod,
      note,
      actor: "admin",
      autoCharge: typeof autoCharge === "boolean" ? autoCharge : undefined,
    });

    res.json({
      ok: true,
      job: updatedJob.toObject(),
      summary,
      charge,
    });
  } catch (e) {
    next(e);
  }
});
router.get("/:id/links", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);
    const job = await Job.findById(id).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    const links = linkFor(job);
    if (!job.vendorToken && !job.customerToken) {
      return res
        .status(409)
        .json({ message: "Links not available. Open bidding first." });
    }

    res.json(links);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/open-bidding", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    job.vendorToken = job.vendorToken || makeToken();
    job.customerToken = job.customerToken || makeToken();
    job.biddingOpen = true;

    await job.save();

    const base = resolveClientBaseUrl(req);
    res.json(linkFor(job, base));
  } catch (e) {
    next(e);
  }
});


// ---------- GET JOB BY ID (for authenticated users) ----------
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid job ID" 
      });
    }

    const job = await Job.findById(id)
      .populate("vendorId", "name phone city lat lng lastSeenAt")
      .populate("customerId", "name email phone")
      .lean();

    if (!job) {
      return res.status(404).json({ 
        success: false,
        message: "Job not found" 
      });
    }

    res.json({
      success: true,
      job: {
        _id: job._id,
        status: job.status,
        serviceType: job.serviceType,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress || "",
        quotedPrice: job.quotedPrice || 0,
        created: job.createdAt || job.created,
        completed: job.completed || null,
        biddingOpen: !!job.biddingOpen,
        bidMode: job.bidMode || "open",
        notes: job.notes || "",
        priority: job.priority || "normal",
        customer: job.customerId ? {
          _id: job.customerId._id,
          name: job.customerId.name,
          email: job.customerId.email,
          phone: job.customerId.phone
        } : null
      },
      vendor: job.vendorId ? {
        _id: job.vendorId._id,
        name: job.vendorId.name,
        city: job.vendorId.city,
        phone: job.vendorId.phone,
        lat: job.vendorId.lat,
        lng: job.vendorId.lng,
        lastSeenAt: job.vendorId.lastSeenAt
      } : null
    });
  } catch (error) {
    console.error("Error fetching job details:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
});

export default router;


