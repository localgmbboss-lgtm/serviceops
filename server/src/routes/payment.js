import { Router } from "express";
import Payment from "../models/Payment.js";
import Job from "../models/Job.js";

const r = Router();

r.get("/", async (req, res, next) => {
  try {
    const { from, to, method, jobId } = req.query;
    const q = {};
    if (from || to) {
      q.receivedAt = {};
      if (from) q.receivedAt.$gte = new Date(from);
      if (to) q.receivedAt.$lte = new Date(to);
    }
    if (method) q.method = method;
    if (jobId) q.jobId = jobId;

    const items = await Payment.find(q)
      .sort({ receivedAt: -1 })
      .limit(200)
      .lean();

    res.json(items);
  } catch (e) {
    next(e);
  }
});

r.post("/", async (req, res, next) => {
  try {
    const { jobId, amount, method, receivedAt, note } = req.body || {};
    if (!jobId) return res.status(400).json({ message: "jobId required" });
    if (amount == null)
      return res.status(400).json({ message: "amount required" });

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const p = await Payment.create({
      jobId,
      amount: Number(amount) || 0,
      method: method || "cash",
      receivedAt: receivedAt ? new Date(receivedAt) : undefined,
      note,
    });
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
});

export default r;
