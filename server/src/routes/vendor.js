// server/src/routes/vendor.js
import { Router } from "express";
import Job from "../models/Jobs.js";
import Customer from "../models/Customer.js";
import { completeJobWithPayment } from "../lib/jobCompletion.js";

const router = Router();

const ALLOWED_NEXT = {
  Unassigned: ["Assigned"],
  Assigned: ["OnTheWay"],
  OnTheWay: ["Arrived"],
  Arrived: [],
  Completed: [],
};

const PAYMENT_METHODS = new Set([
  "cash",
  "card",
  "zelle",
  "venmo",
  "bank_transfer",
  "other",
]);

const serializeJob = (jobDoc) => {
  if (!jobDoc) return null;
  const job = jobDoc.toObject ? jobDoc.toObject() : jobDoc;
  return {
    _id: job._id,
    serviceType: job.serviceType,
    pickupAddress: job.pickupAddress,
    dropoffAddress: job.dropoffAddress || null,
    status: job.status,
    created: job.created,
    reportedPayment: job.reportedPayment || null,
    commission: job.commission || null,
    flags: job.flags || null,
    expectedRevenue: job.expectedRevenue || 0,
  };
};

// GET /api/vendor/:token  -> job view for accepted vendor
router.get("/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const job = await Job.findOne({ vendorAcceptedToken: token }).lean();
    if (!job) return res.status(404).json({ message: "Invalid link" });

    const customer = await Customer.findById(
      job.customerId,
      "name phone"
    ).lean();

    res.json({
      job: serializeJob(job),
      customer: customer || null,
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/vendor/:token/status  -> vendor progresses status (non-completion)
router.patch("/:token/status", async (req, res, next) => {
  try {
    const { token } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ message: "status required" });

    if (status === "Completed") {
      return res.status(409).json({ message: "Use completion flow to finish job" });
    }

    const job = await Job.findOne({ vendorAcceptedToken: token });
    if (!job) return res.status(404).json({ message: "Invalid link" });
    if (job.status === "Completed") {
      return res.status(409).json({ message: "Completed jobs are locked" });
    }

    const allowed = new Set(ALLOWED_NEXT[job.status] || []);
    if (!allowed.has(status)) {
      return res
        .status(409)
        .json({ message: `Cannot move from ${job.status} to ${status}` });
    }

    job.status = status;
    await job.save();

    res.json({ ok: true, status: job.status });
  } catch (e) {
    next(e);
  }
});

// POST /api/vendor/:token/complete -> vendor submits completion + payment report
router.post("/:token/complete", async (req, res, next) => {
  try {
    const { token } = req.params;
    const { amount, method, note } = req.body || {};

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

    const job = await Job.findOne({ vendorAcceptedToken: token });
    if (!job) return res.status(404).json({ message: "Invalid link" });
    if (job.status === "Completed") {
      return res.status(409).json({ message: "Job already completed" });
    }
    if (!job.vendorId) {
      return res.status(409).json({ message: "Job is not assigned to a vendor" });
    }

    const { summary, job: updatedJob, charge } = await completeJobWithPayment(job, {
      amount: rawAmount,
      method: paymentMethod,
      note,
      actor: "vendor",
    });

    res.json({
      ok: true,
      job: serializeJob(updatedJob),
      summary,
      charge,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
