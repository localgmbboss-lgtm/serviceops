// server/src/routes/public.js
import { Router } from "express";
import crypto from "crypto";
import Customer from "../models/Customer.js";
import Job from "../models/Jobs.js";
import AdminNotification from "../models/AdminNotification.js";
import { getClientBaseUrl } from "../lib/clientUrl.js";
import { sendAdminPushNotifications } from "../lib/push.js";

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
router.post("/jobs", async (req, res, next) => {
  try {
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
    } = req.body || {};

    // 1) Validate basic identity
    if (!isNonEmpty(name) || !isNonEmpty(phone)) {
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
      return res.status(400).json({ message: "Pickup location required" });
    }

    // 3) Service normalization (strict list)
    const serviceType = normalizeService(serviceTypeRaw);
    if (!serviceType) {
      return res.status(400).json({ message: "Invalid serviceType" });
    }

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
      heavyDuty: !!heavyDuty,

      pickupAddress: isNonEmpty(pickupAddress) ? pickupAddress : undefined,
      pickupLat: Number.isFinite(pickupLat) ? pickupLat : undefined,
      pickupLng: Number.isFinite(pickupLng) ? pickupLng : undefined,

      dropoffAddress: isNonEmpty(dropoffAddress)
        ? String(dropoffAddress).trim()
        : undefined,

      shareLive: !!shareLive,
      vehiclePinned: !!vehiclePinned,

      // bidding flags
      biddingOpen: true,
    });

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
    next(e);
  }
});

export default router;
