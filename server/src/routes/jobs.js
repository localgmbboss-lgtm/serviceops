// server/src/routes/jobs.js
import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { completeJobWithPayment } from "../lib/jobCompletion.js";
import Job from "../models/Jobs.js";
import Vendor from "../models/Vendor.js"; // Changed from Driver to Vendor
import Customer from "../models/Customer.js";
import { notifySMS } from "../lib/notifier.js";
import VendorNotification from "../models/VendorNotification.js";
import { getClientBaseUrl, resolveClientBaseUrl } from "../lib/clientUrl.js";
import { sendVendorPushNotifications } from "../lib/push.js";
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

const toRadians = (deg) => (deg * Math.PI) / 180;
const haversineKm = (aLat, aLng, bLat, bLng) => {
  const lat1 = Number(aLat);
  const lat2 = Number(bLat);
  const lng1 = Number(aLng);
  const lng2 = Number(bLng);
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity;
  }
  const R = 6371; // km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

const SCHEDULING_STATUSES = new Set([
  "none",
  "requested",
  "confirmed",
  "rescheduled",
  "cancelled",
]);

const sanitizeSchedulingPayload = (payload = {}, base = null) => {
  if (!payload || typeof payload !== "object") return null;

  const next = base
    ? {
        status: base.status || "none",
        requestedWindowStart: base.requestedWindowStart
          ? new Date(base.requestedWindowStart)
          : null,
        requestedWindowEnd: base.requestedWindowEnd
          ? new Date(base.requestedWindowEnd)
          : null,
        confirmedWindowStart: base.confirmedWindowStart
          ? new Date(base.confirmedWindowStart)
          : null,
        confirmedWindowEnd: base.confirmedWindowEnd
          ? new Date(base.confirmedWindowEnd)
          : null,
        timezone: base.timezone || null,
        customerNotes: base.customerNotes || "",
        lastUpdatedBy: base.lastUpdatedBy || "system",
        confirmations: Array.isArray(base.confirmations)
          ? base.confirmations.map((entry) => ({
              at: entry.at ? new Date(entry.at) : new Date(),
              actor: entry.actor || "system",
              channel: entry.channel || "system",
              note: entry.note || "",
            }))
          : [],
        options: Array.isArray(base.options)
          ? base.options.map((option) => ({
              start: option.start ? new Date(option.start) : null,
              end: option.end ? new Date(option.end) : null,
              note: option.note || "",
              proposedBy: option.proposedBy || "system",
            }))
          : [],
      }
    : {
        status: "none",
        confirmations: [],
        options: [],
        timezone: null,
        customerNotes: "",
        lastUpdatedBy: "system",
      };
  let changed = false;

  const toDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const maybeDateField = (key, aliases = []) => {
    const possibleKeys = [key, ...aliases];
    for (const alias of possibleKeys) {
      if (Object.prototype.hasOwnProperty.call(payload, alias)) {
        const val = payload[alias];
        if (val === null) {
          next[key] = null;
          changed = true;
          return;
        }
        const date = toDate(val);
        if (date) {
          next[key] = date;
          changed = true;
          return;
        }
      }
    }
  };

  maybeDateField("requestedWindowStart", ["requestedStart", "windowStart"]);
  maybeDateField("requestedWindowEnd", ["requestedEnd", "windowEnd"]);
  maybeDateField("confirmedWindowStart", [
    "confirmedStart",
    "scheduledStart",
  ]);
  maybeDateField("confirmedWindowEnd", ["confirmedEnd", "scheduledEnd"]);

  if (Object.prototype.hasOwnProperty.call(payload, "timezone")) {
    next.timezone =
      typeof payload.timezone === "string"
        ? payload.timezone.trim() || null
        : null;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "customerNotes")) {
    next.customerNotes =
      typeof payload.customerNotes === "string"
        ? payload.customerNotes.trim()
        : "";
    changed = true;
  }

  if (payload.lastUpdatedBy) {
    next.lastUpdatedBy = String(payload.lastUpdatedBy);
    changed = true;
  }

  if (payload.status && SCHEDULING_STATUSES.has(String(payload.status))) {
    next.status = String(payload.status);
    changed = true;
  } else if (!base && (next.requestedWindowStart || next.requestedWindowEnd)) {
    next.status = "requested";
    changed = true;
  }

  if (Array.isArray(payload.confirmations)) {
    next.confirmations = payload.confirmations
      .map((entry) => {
        const at = toDate(entry.at) || new Date();
        return {
          at,
          actor:
            typeof entry.actor === "string"
              ? entry.actor.trim()
              : "system",
          channel:
            typeof entry.channel === "string"
              ? entry.channel.trim()
              : "system",
          note: typeof entry.note === "string" ? entry.note.trim() : "",
        };
      })
      .filter(Boolean);
    changed = true;
  } else if (payload.confirmations === null) {
    next.confirmations = [];
    changed = true;
  }

  if (Array.isArray(payload.options)) {
    next.options = payload.options
      .map((option) => {
        const start = toDate(option.start);
        const end = toDate(option.end);
        return {
          start,
          end,
          note: typeof option.note === "string" ? option.note.trim() : "",
          proposedBy:
            typeof option.proposedBy === "string"
              ? option.proposedBy.trim()
              : "system",
        };
      })
      .filter((option) => option.start || option.end);
    changed = true;
  } else if (payload.options === null) {
    next.options = [];
    changed = true;
  }

  return changed ? next : null;
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

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);

    const job = await Job.findById(id).lean();
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const [customerDoc, vendorDoc] = await Promise.all([
      job.customerId ? Customer.findById(job.customerId).lean() : null,
      job.vendorId ? Vendor.findById(job.vendorId).lean() : null,
    ]);

    let nearbyVendors = [];
    const hasPickupCoords =
      Number.isFinite(job.pickupLat) && Number.isFinite(job.pickupLng);

    if (hasPickupCoords) {
      const vendors = await Vendor.find({
        lat: { $exists: true },
        lng: { $exists: true },
      })
        .select("_id name phone lat lng services heavyDuty radiusKm lastSeenAt active")
        .lean();

      nearbyVendors = vendors
        .filter((vendor) => vendor && String(vendor._id) !== String(job.vendorId || ""))
        .map((vendor) => {
          const distanceKm = haversineKm(
            job.pickupLat,
            job.pickupLng,
            vendor.lat,
            vendor.lng
          );
          return {
            _id: vendor._id,
            name: vendor.name || "",
            phone: vendor.phone || "",
            lat: vendor.lat ?? null,
            lng: vendor.lng ?? null,
            services: vendor.services || [],
            heavyDuty: vendor.heavyDuty || false,
            radiusKm: vendor.radiusKm || null,
            lastSeenAt: vendor.lastSeenAt || vendor.updatedAt || null,
            active: vendor.active !== false,
            distanceKm,
          };
        })
        .filter((vendor) => vendor.distanceKm < Infinity)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 12);
    }

    const safeJob = {
      ...job,
      _id: job._id,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    const customer = customerDoc
      ? {
          _id: customerDoc._id,
          name: customerDoc.name || customerDoc.savedProfile?.name || "",
          phone: customerDoc.phone || customerDoc.savedProfile?.phone || "",
          email: customerDoc.email || customerDoc.savedProfile?.email || "",
          savedProfile: customerDoc.savedProfile || null,
          lastServiceRequest: customerDoc.lastServiceRequest || null,
        }
      : null;

    const vendor = vendorDoc
      ? {
          _id: vendorDoc._id,
          name: vendorDoc.name || "",
          phone: vendorDoc.phone || "",
          email: vendorDoc.email || "",
          lat: vendorDoc.lat ?? null,
          lng: vendorDoc.lng ?? null,
          services: vendorDoc.services || [],
          heavyDuty: vendorDoc.heavyDuty || false,
          radiusKm: vendorDoc.radiusKm || null,
          lastSeenAt: vendorDoc.lastSeenAt || vendorDoc.updatedAt || null,
        }
      : null;

    const coordinates = {
      pickup: Number.isFinite(job.pickupLat) && Number.isFinite(job.pickupLng)
        ? { lat: job.pickupLat, lng: job.pickupLng }
        : null,
      dropoff:
        Number.isFinite(job.dropoffLat) && Number.isFinite(job.dropoffLng)
          ? { lat: job.dropoffLat, lng: job.dropoffLng }
          : null,
    };

    const timeline = {
      created: job.created,
      assignedAt: job.assignedAt || null,
      onTheWayAt: job.onTheWayAt || null,
      arrivedAt: job.arrivedAt || null,
      completedAt: job.completedAt || job.completed || null,
      escalatedAt: job.escalatedAt || null,
    };

    const payment = {
      status: job.paymentStatus || "pending",
      method: job.paymentMethod || job.reportedPayment?.method || null,
      reported: job.reportedPayment || null,
      finalPrice: job.finalPrice || null,
      quotedPrice: job.quotedPrice || null,
      paymentDate: job.paymentDate || null,
      commission: job.commission || null,
    };

    const links = linkFor(job, resolveClientBaseUrl(req));

    res.json({
      job: safeJob,
      customer,
      vendor,
      coordinates,
      timeline,
      payment,
      nearbyVendors,
      links,
    });
  } catch (error) {
    next(error);
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

    const schedulingPayload = sanitizeSchedulingPayload(body.scheduling);
    if (schedulingPayload) {
      jobPayload.scheduling = schedulingPayload;
    }

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

    if (Object.prototype.hasOwnProperty.call(payload, "scheduling")) {
      if (payload.scheduling === null) {
        unset.scheduling = "";
      } else {
        const currentScheduling = job.scheduling
          ? (typeof job.scheduling.toObject === "function"
              ? job.scheduling.toObject()
              : job.scheduling)
          : null;
        const schedulingUpdate = sanitizeSchedulingPayload(
          payload.scheduling,
          currentScheduling
        );
        if (schedulingUpdate) {
          set.scheduling = schedulingUpdate;
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

router.post("/:id/scheduling", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const payload = req.body || {};
    const currentScheduling = job.scheduling
      ? (typeof job.scheduling.toObject === "function"
          ? job.scheduling.toObject()
          : job.scheduling)
      : null;
    const schedulingUpdate = sanitizeSchedulingPayload(
      payload,
      currentScheduling
    );

    if (!schedulingUpdate) {
      return res.status(400).json({ message: "No scheduling changes supplied" });
    }

    job.scheduling = schedulingUpdate;
    await job.save();

    res.json(job.toObject());
  } catch (error) {
    next(error);
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

router.post("/:id/ping-vendors", async (req, res, next) => {
  try {
    const { id } = req.params;
    assertId(id);
    const { vendorIds, message } = req.body || {};

    if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
      return res.status(400).json({ message: "vendorIds array required" });
    }

    const job = await Job.findById(id).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    const validVendorIds = vendorIds
      .map((value) => {
        try {
          return new mongoose.Types.ObjectId(String(value));
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);

    if (!validVendorIds.length) {
      return res.status(400).json({ message: "No valid vendor ids provided" });
    }

    const vendors = await Vendor.find({
      _id: { $in: validVendorIds },
    })
      .select("_id name phone updatesPaused")
      .lean();

    if (!vendors.length) {
      return res.status(404).json({ message: "No vendors found for ping." });
    }

    const baseMessage =
      typeof message === "string" && message.trim().length
        ? message.trim()
        : `Job ${job.serviceType || ""} near ${job.pickupAddress || "customer"} needs assistance.`;

    const results = [];
    const notificationDocs = [];
    for (const vendor of vendors) {
      const jobLabel = `#${String(job._id).slice(-6).toUpperCase()}`;
      const notificationBody = [
        baseMessage,
        job.pickupAddress ? `Pickup: ${job.pickupAddress}` : null,
        `Status: ${job.status || "Unassigned"}`,
        `Job ${jobLabel}`,
      ]
        .filter(Boolean)
        .join("\n");
      notificationDocs.push({
        vendorId: vendor._id,
        jobId: job._id,
        source: "admin_ping",
        title: job.serviceType
          ? `${job.serviceType} dispatch ping`
          : "Dispatch ping",
        body: notificationBody,
        severity: "warning",
        meta: {
          role: "vendor",
          kind: "ping",
          jobId: job._id,
          status: job.status || "Unassigned",
          route: "/vendor/app",
          jobLabel,
          vendorName: vendor.name || null,
        },
      });

      const hasPhone =
        typeof vendor.phone === "string" && vendor.phone.trim().length > 0;
      if (!hasPhone) {
        results.push({
          vendorId: vendor._id,
          ok: true,
          queuedId: null,
          channels: { sms: false, inApp: true },
          note: "No phone on file; sent in-app notification only.",
        });
        continue;
      }

      const smsBody = `${baseMessage}
Status: ${job.status || "Unassigned"}
Respond in the ServiceOps vendor portal if available.`;
      try {
        const { ok, queuedId } = await notifySMS(
          vendor.phone,
          smsBody,
          job._id
        );
        results.push({
          vendorId: vendor._id,
          ok: Boolean(ok),
          queuedId: queuedId || null,
          channels: { sms: Boolean(ok), inApp: true },
        });
      } catch (error) {
        results.push({
          vendorId: vendor._id,
          ok: false,
          error: error?.message || "Failed to notify vendor",
          channels: { sms: false, inApp: true },
        });
      }
    }

    if (notificationDocs.length) {
      try {
        const inserted = await VendorNotification.insertMany(
          notificationDocs,
          {
            ordered: false,
          }
        );
        if (Array.isArray(inserted) && inserted.length) {
          await sendVendorPushNotifications(inserted);
        }
      } catch (insertError) {
        const insertedDocs = insertError?.insertedDocs || [];
        if (insertedDocs.length) {
          await sendVendorPushNotifications(insertedDocs);
        }
        // swallow the error after attempting to notify subscribers
      }
    }

    res.json({
      ok: true,
      count: results.length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

export default router;


