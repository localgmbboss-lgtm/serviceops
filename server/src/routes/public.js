// server/src/routes/public.js
import { Router } from "express";
import crypto from "crypto";
import path from "path";
import fsPromises from "fs/promises";
import Customer from "../models/Customer.js";
import Job from "../models/Jobs.js";
import AdminNotification from "../models/AdminNotification.js";
import { getClientBaseUrl } from "../lib/clientUrl.js";
import {
  sendAdminPushNotifications,
  sendCustomerPushNotifications,
} from "../lib/push.js";
import { jobMediaUpload, jobMediaUploadRoot, toJobMediaRecord, JOB_MEDIA_MAX_FILES } from "../lib/jobMedia.js";

const router = Router();

const baseClient = getClientBaseUrl();

// --- helpers -------------------------------------------------
const isNonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
const toNumOr = (v, fallback = undefined) =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;

// Canonical, case-insensitive service normalization
const normalizeService = (s) => {
  if (!isNonEmpty(s)) return null;
  const cleaned = String(s).trim().replace(/\s+/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

// --- routes --------------------------------------------------
router.post("/jobs", jobMediaUpload.array("media", JOB_MEDIA_MAX_FILES), async (req, res, next) => {
  const storedFiles = [];
  const files = Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    storedFiles.push(path.join(jobMediaUploadRoot, file.filename));
  }

  const cleanupUploaded = async () => {
    if (!storedFiles.length) return;
    await Promise.all(
      storedFiles.map((filepath) => fsPromises.unlink(filepath).catch(() => {}))
    );
    storedFiles.length = 0;
  };

  try {
    let body = req.body || {};
    if (typeof body.payload === "string") {
      try {
        body = JSON.parse(body.payload);
      } catch (error) {
        await cleanupUploaded();
        return res.status(400).json({ message: "Invalid request payload" });
      }
    }

    const {
      name,
      phone,

      // either provide pickupAddress, or nested pickup { address, lat, lng }
      pickupAddress: pickupAddressRaw,
      pickup: pickupRaw,

      pickupLat: pickupLatRaw,
      pickupLng: pickupLngRaw,

      dropoffAddress,
      serviceType: serviceTypeRaw,
      notes,
      heavyDuty,
      shareLive,
      vehiclePinned,
      vehicleMake,
      vehicleModel,
      vehicleColor,
      distanceMeters,
      distanceText,
      etaSeconds,
    } = body || {};

    // 1) Validate basic identity
    if (!isNonEmpty(name) || !isNonEmpty(phone)) {
      await cleanupUploaded();
      return res.status(400).json({ message: "Missing name or phone" });
    }

    // 2) Location: accept either top-level pickupAddress / pickupLat/Lng OR pickup{...}
    let pickupAddress = isNonEmpty(pickupAddressRaw)
      ? pickupAddressRaw.trim()
      : (pickupRaw?.address && String(pickupRaw.address).trim()) || "";

    // allow coordinates from either shape
    let pickupLat = toNumOr(pickupLatRaw) ?? toNumOr(pickupRaw?.lat, undefined);
    let pickupLng = toNumOr(pickupLngRaw) ?? toNumOr(pickupRaw?.lng, undefined);

    if (
      !isNonEmpty(pickupAddress) &&
      !(Number.isFinite(pickupLat) && Number.isFinite(pickupLng))
    ) {
      await cleanupUploaded();
      return res.status(400).json({ message: "Pickup location required" });
    }

    // 3) Service normalization (strict list)
    const serviceType = normalizeService(serviceTypeRaw);
    if (!serviceType) {
      await cleanupUploaded();
      return res.status(400).json({ message: "Invalid serviceType" });
    }

    const distanceMetersNumber = toNumOr(distanceMeters, undefined);
    const etaSecondsNumber = toNumOr(etaSeconds, undefined);

    // 4) Upsert customer by phone
    let cust = await Customer.findOne({ phone: String(phone).trim() }).exec();
    if (!cust) {
      cust = await Customer.create({
        name: String(name).trim(),
        phone: String(phone).trim(),
      });
    }

    // 5) Create job
    const job = await Job.create({
      customerId: cust._id,
      status: "Unassigned",
      created: new Date(),

      serviceType,
      notes: isNonEmpty(notes) ? String(notes).trim() : undefined,
      heavyDuty:
        typeof heavyDuty === "string"
          ? heavyDuty.toLowerCase() === "true"
          : Boolean(heavyDuty),

      pickupAddress: isNonEmpty(pickupAddress) ? pickupAddress : undefined,
      pickupLat: Number.isFinite(pickupLat) ? pickupLat : undefined,
      pickupLng: Number.isFinite(pickupLng) ? pickupLng : undefined,

      dropoffAddress: isNonEmpty(dropoffAddress)
        ? String(dropoffAddress).trim()
        : undefined,
      shareLive:
        typeof shareLive === "string"
          ? shareLive.toLowerCase() === "true"
          : Boolean(shareLive),
      vehiclePinned:
        typeof vehiclePinned === "string"
          ? vehiclePinned.toLowerCase() === "true"
          : Boolean(vehiclePinned ?? true),
      vehicleMake: isNonEmpty(vehicleMake) ? vehicleMake.trim() : undefined,
      vehicleModel: isNonEmpty(vehicleModel) ? vehicleModel.trim() : undefined,
      vehicleColor: isNonEmpty(vehicleColor) ? vehicleColor.trim() : undefined,
      estimatedDistance: isNonEmpty(distanceText)
        ? String(distanceText).trim()
        : undefined,
      estimatedDuration: Number.isFinite(etaSecondsNumber)
        ? Math.round(etaSecondsNumber / 60)
        : undefined,
      media: files.length ? files.map((file) => toJobMediaRecord(file)) : [],
      // optionally store raw meters
      distanceMeters: Number.isFinite(distanceMetersNumber)
        ? distanceMetersNumber
        : undefined,
      // bidding flags
      biddingOpen: true,
    });
    storedFiles.length = 0;

    // 6) Generate tokens (idempotent-friendly)
    if (!job.vendorToken)
      job.vendorToken = crypto.randomBytes(16).toString("hex");
    if (!job.customerToken)
      job.customerToken = crypto.randomBytes(16).toString("hex");
    job.biddingOpen = true;
    await job.save();

    // 7) Build links
    const statusUrl = `${baseClient}/status/${job._id}`;
    const vendorLink = `${baseClient}/bid/${job.vendorToken}`;
    const customerLink = `${baseClient}/choose/${job.customerToken}`;

    // (Optional) TODO: broadcast to vendors here based on service + radius
    // e.g., await broadcastNewJob(job)

    // Notify admins about the new customer request
    try {
      const adminNotification = await AdminNotification.create({
        title: "New customer request",
        body: `${serviceType} request from ${cust.name || name}`,
        severity: "info",
        jobId: job._id,
        customerId: cust._id,
        meta: {
          role: "admin",
          route: `/jobs/${job._id}`,
          jobId: job._id,
          customerId: cust._id,
          serviceType,
          pickupAddress: pickupAddress || null,
          pickupLat: Number.isFinite(pickupLat) ? pickupLat : null,
          pickupLng: Number.isFinite(pickupLng) ? pickupLng : null,
        },
      });
      await sendAdminPushNotifications([adminNotification]);
    } catch (notifyError) {
      console.error("Failed to notify admins about new request:", notifyError);
    }

    try {
      await sendCustomerPushNotifications([
        {
          customerId: cust._id,
          jobId: job._id,
          title: "Request received",
          body: `${serviceType} request logged. We'll notify you when a provider responds.`,
          severity: "info",
          meta: {
            role: "customer",
            jobId: job._id,
            kind: "status",
            route: `/status/${job._id}`,
            absoluteUrl: statusUrl,
            dedupeKey: `customer:job:${job._id}:created`,
          },
        },
      ]);
    } catch (notifyCustomerError) {
      console.error(
        "Failed to notify customer about new request",
        notifyCustomerError
      );
    }

    // 8) Respond with everything the client needs (fixes "undefined token" issues)
    return res.status(201).json({
      ok: true,
      jobId: job._id,

      statusUrl,
      statusPath: `/status/${job._id}`,

      vendorLink,
      customerLink,
      customerToken: job.customerToken,
    });
  } catch (e) {
    await cleanupUploaded();
    next(e);
  }
});

export default router;
