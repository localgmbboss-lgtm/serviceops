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
import { z } from "zod";
import { validate } from "../lib/validation.js";
import {
  publicJobCounter,
  publicJobDuration,
} from "../lib/metrics.js";

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

const optionalNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return undefined;
    const num = Number(val);
    return num;
  })
  .refine((val) => val === undefined || Number.isFinite(val), {
    message: "Invalid number",
  });

const optionalBoolean = z
  .union([z.boolean(), z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return undefined;
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
    if (typeof val === "string") {
      const lowered = val.trim().toLowerCase();
      if (!lowered) return undefined;
      if (["true", "1", "yes", "on"].includes(lowered)) return true;
      if (["false", "0", "no", "off"].includes(lowered)) return false;
    }
    return val;
  })
  .refine((val) => val === undefined || typeof val === "boolean", {
    message: "Invalid boolean",
  });

const stringOptional = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined) return undefined;
    const trimmed = String(val).trim();
    return trimmed.length ? trimmed : undefined;
  });

const publicJobSchema = z
  .object({
    name: z
      .string({
        required_error: "name is required",
        invalid_type_error: "name must be a string",
      })
      .trim()
      .min(1, "name is required")
      .max(120, "name too long"),
    phone: z
      .string({
        required_error: "phone is required",
        invalid_type_error: "phone must be a string",
      })
      .trim()
      .min(5, "phone is required")
      .max(32, "phone too long"),
    serviceType: z
      .string({
        required_error: "serviceType is required",
        invalid_type_error: "serviceType must be a string",
      })
      .min(1, "serviceType is required")
      .transform((value) => normalizeService(value))
      .refine((value) => Boolean(value), { message: "Invalid serviceType" }),
    pickupAddress: stringOptional,
    pickup: z
      .object({
        address: stringOptional,
        lat: optionalNumber,
        lng: optionalNumber,
      })
      .partial()
      .optional(),
    pickupLat: optionalNumber,
    pickupLng: optionalNumber,
    dropoffAddress: stringOptional,
    notes: stringOptional,
    heavyDuty: optionalBoolean,
    shareLive: optionalBoolean,
    vehiclePinned: optionalBoolean,
    vehicleMake: stringOptional,
    vehicleModel: stringOptional,
    vehicleColor: stringOptional,
    distanceMeters: optionalNumber,
    distanceText: stringOptional,
    etaSeconds: optionalNumber,
  })
  .superRefine((data, ctx) => {
    const pickupAddress =
      data.pickupAddress ??
      data.pickup?.address ??
      undefined;
    const pickupLat = data.pickupLat ?? data.pickup?.lat;
    const pickupLng = data.pickupLng ?? data.pickup?.lng;

    if (
      !pickupAddress &&
      !(Number.isFinite(pickupLat) && Number.isFinite(pickupLng))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pickup location required",
        path: ["pickupAddress"],
      });
    }
  });

// --- routes --------------------------------------------------
router.post("/jobs", jobMediaUpload.array("media", JOB_MEDIA_MAX_FILES), async (req, res, next) => {
  const endTimer = publicJobDuration.startTimer();
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
        if (req.log) {
          req.log.warn({ err: error }, "Failed to parse public payload");
        }
        publicJobCounter.labels("invalid_json").inc();
        endTimer();
        return res.status(400).json({ message: "Invalid request payload" });
      }
    }

    const validation = validate(publicJobSchema, body || {});
    if (!validation.success) {
      await cleanupUploaded();
      publicJobCounter.labels("validation_error").inc();
      endTimer();
      return res.status(400).json(validation.error);
    }

    const {
      name,
      phone,
      serviceType,
      pickupAddress: pickupAddressRaw,
      pickup,
      pickupLat: pickupLatRaw,
      pickupLng: pickupLngRaw,
      dropoffAddress,
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
    } = validation.data;

    const pickupAddress = pickupAddressRaw ?? pickup?.address ?? "";
    const pickupLat =
      pickupLatRaw ?? (Number.isFinite(pickup?.lat) ? pickup?.lat : undefined);
    const pickupLng =
      pickupLngRaw ?? (Number.isFinite(pickup?.lng) ? pickup?.lng : undefined);

    // 4) Upsert customer by phone
    let cust = await Customer.findOne({ phone }).exec();
    if (!cust) {
      cust = await Customer.create({
        name,
        phone,
      });
    }

    // 5) Create job
    const job = await Job.create({
      customerId: cust._id,
      status: "Unassigned",
      created: new Date(),

      serviceType,
      notes,
      heavyDuty: heavyDuty ?? false,

      pickupAddress: pickupAddress || undefined,
      pickupLat: Number.isFinite(pickupLat) ? pickupLat : undefined,
      pickupLng: Number.isFinite(pickupLng) ? pickupLng : undefined,

      dropoffAddress,
      shareLive: shareLive ?? false,
      vehiclePinned: vehiclePinned ?? true,
      vehicleMake,
      vehicleModel,
      vehicleColor,
      estimatedDistance: distanceText,
      estimatedDuration: Number.isFinite(etaSeconds)
        ? Math.round(etaSeconds / 60)
        : undefined,
      media: files.length ? files.map((file) => toJobMediaRecord(file)) : [],
      // optionally store raw meters
      distanceMeters: Number.isFinite(distanceMeters)
        ? distanceMeters
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
      if (req.log) {
        req.log.error(
          { err: notifyError, jobId: job._id },
          "Failed to notify admins about new request"
        );
      }
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
      if (req.log) {
        req.log.error(
          { err: notifyCustomerError, jobId: job._id },
          "Failed to notify customer about new request"
        );
      }
    }

    if (req.log) {
      req.log.debug(
        {
          jobId: job._id,
          customerId: cust._id,
          serviceType,
          pickupAddress: pickupAddress || null,
        },
        "Public job intake created"
      );
    }

    publicJobCounter.labels("success").inc();
    endTimer();

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
    if (req.log) {
      req.log.error({ err: e }, "Public job intake failed");
    }
    publicJobCounter.labels("error").inc();
    endTimer();
    next(e);
  }
});

export default router;
