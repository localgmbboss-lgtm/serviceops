import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";

const router = Router();

// GET /api/vendor/:token   (accepted job portal)
router.get("/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const job = await Job.findOne({ vendorAcceptedToken: token }).lean();
    if (!job)
      return res.status(404).json({ message: "Invalid or expired link" });

    const customer = await Customer.findById(job.customerId).lean();
    const vendor = job.vendorId
      ? await Vendor.findById(job.vendorId, "name phone baseAddress lat lng").lean()
      : null;

    res.json({
      job: {
        _id: job._id,
        status: job.status,
        serviceType: job.serviceType,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress || null,
        pickupLat: job.pickupLat ?? null,
        pickupLng: job.pickupLng ?? null,
        dropoffLat: job.dropoffLat ?? null,
        dropoffLng: job.dropoffLng ?? null,
        estimatedDuration: job.estimatedDuration || null,
        estimatedDistance: job.estimatedDistance || null,
      },
      customer: customer
        ? { name: customer.name, phone: customer.phone }
        : null,
      vendor: vendor
        ? {
            _id: vendor._id,
            name: vendor.name || null,
            phone: vendor.phone || null,
            baseAddress: vendor.baseAddress || null,
            lat: vendor.lat ?? null,
            lng: vendor.lng ?? null,
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/vendor/:token/status  (update job status)
router.patch("/:token/status", async (req, res, next) => {
  try {
    const { token } = req.params;
    const { status } = req.body || {};
    const allowed = ["OnTheWay", "Arrived", "Completed"];

    const job = await Job.findOne({ vendorAcceptedToken: token });
    if (!job)
      return res.status(404).json({ message: "Invalid or expired link" });
    if (!allowed.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    // keep your job transition rules if needed
    job.status = status;
    if (status === "Completed" && !job.completed) job.completed = new Date();

    await job.save();
    res.json({ ok: true, status: job.status });
  } catch (e) {
    next(e);
  }
});

export default router;


