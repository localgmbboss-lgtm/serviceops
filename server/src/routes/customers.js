import { Router } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Job from "../models/Jobs.js"; // 
import Driver from "../models/Driver.js";
import { requireFields } from "../lib/validate.js";

const router = Router();
const isObjId = (s) => mongoose.isValidObjectId(s);

// CREATE customer — POST /api/customers
router.post("/", async (req, res, next) => {
  try {
    requireFields(req.body, ["name", "phone"]);
    const created = await Customer.create({
      name: req.body.name,
      phone: req.body.phone,
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

// LIST customers — GET /api/customers
router.get("/", async (_req, res, next) => {
  try {
    const list = await Customer.find({}, "name phone").lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
});

/**
 * STATUS — GET /api/customers/:id/status
 * Accepts:
 *  - :id = jobId  -> return that job + driver
 *  - :id = customerId -> return latest (active first, else latest) job for that customer
 *  - :id = "demo" or "latest" -> latest job in DB
 *  - non-ObjectId -> try as customer phone
 */
router.get("/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    let job = null;
    let customer = null;

    // 1) Dev shortcuts
    if (id === "demo" || id === "latest") {
      job = await Job.findOne({}).sort({ created: -1 }).lean();
      if (!job) return res.status(404).json({ message: "No jobs yet" });
      customer = job.customerId
        ? await Customer.findById(job.customerId).lean()
        : null;
    }
    // 2) Valid ObjectId: try as Job first; else as Customer
    else if (isObjId(id)) {
      job = await Job.findById(id).lean(); // try jobId
      if (job) {
        customer = job.customerId
          ? await Customer.findById(job.customerId).lean()
          : null;
      } else {
        // treat as customerId
        customer = await Customer.findById(id).lean();
        if (!customer)
          return res.status(404).json({ message: "Customer not found" });
        job =
          (await Job.findOne({
            customerId: customer._id,
            status: { $ne: "Completed" },
          })
            .sort({ created: -1 })
            .lean()) ||
          (await Job.findOne({ customerId: customer._id })
            .sort({ created: -1 })
            .lean());
      }
    }
    // 3) Not an ObjectId: try by customer phone
    else {
      customer = await Customer.findOne({ phone: id }).lean();
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });
      job =
        (await Job.findOne({
          customerId: customer._id,
          status: { $ne: "Completed" },
        })
          .sort({ created: -1 })
          .lean()) ||
        (await Job.findOne({ customerId: customer._id })
          .sort({ created: -1 })
          .lean());
    }

    if (!job) return res.status(404).json({ message: "Status not found" });

    const driver = job.driverId
      ? await Driver.findById(job.driverId).lean()
      : null;

    // minimal, stable shape for CustomerDashboard
    res.json({
      customer: customer
        ? { _id: customer._id, name: customer.name, phone: customer.phone }
        : null,
      job: {
        _id: job._id,
        status: job.status,
        serviceType: job.serviceType,
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress,
        quotedPrice: job.quotedPrice,
        bidMode: job.bidMode || "open",
        created: job.created,
        completed: job.completed || null,
      },
      driver: driver
        ? {
            _id: driver._id,
            name: driver.name,
            city: driver.city,
            phone: driver.phone,
            lat: driver.lat,
            lng: driver.lng,
            lastSeenAt: driver.lastSeenAt,
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/customers/:id/jobs?limit=10
router.get("/:id/jobs", async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(100, Number(req.query.limit || 10));
    const query = isObjId(id) ? { customerId: id } : {};
    const jobs = await Job.find(query)
      .sort({ created: -1 })
      .limit(limit)
      .lean();
    res.json(jobs);
  } catch (e) {
    next(e);
  }
});

export default router;
