import { Router } from "express";
import Driver from "../models/Driver.js";
import Vendor from "../models/Vendor.js";
import Job from "../models/Jobs.js";
import Feedback from "../models/Feedback.js";
import Payment from "../models/Payment.js";
import { complianceSummary } from "../lib/compliance.js";

const r = Router();
r.get("/vendors", async (_req, res, next) => {
  try {
    const vendors = await Vendor.find({}).sort({ name: 1 }).lean();

    res.json(
      vendors.map((v) => ({
        _id: v._id,
        name: v.name,
        phone: v.phone || "",
        email: v.email || "",
        city: v.city || "",
        services: Array.isArray(v.services) ? v.services : [],
        heavyDuty: !!v.heavyDuty,
        lat: typeof v.lat === "number" ? v.lat : null,
        lng: typeof v.lng === "number" ? v.lng : null,
        active: v.active !== false,
      }))
    );
  } catch (e) {
    next(e);
  }
});

// /api/admin/drivers/overview
r.get("/drivers/overview", async (_req, res, next) => {
  try {
    const drivers = await Driver.find({}).lean();
    const ids = drivers.map((d) => String(d._id));

    const jobs = await Job.find({ driverId: { $in: ids } }).lean();
    const byDriverJobs = new Map(ids.map((id) => [id, []]));
    jobs.forEach((j) => {
      const k = String(j.driverId);
      if (byDriverJobs.has(k)) byDriverJobs.get(k).push(j);
    });

    const jobIds = jobs
      .filter((j) => j.status === "Completed")
      .map((j) => String(j._id));
    const fbs = await Feedback.find({ jobId: { $in: jobIds } }).lean();
    const pays = await Payment.find({ jobId: { $in: jobIds } }).lean();

    // Index
    const fbByJob = new Map(fbs.map((f) => [String(f.jobId), f]));
    const payByJob = new Map();
    pays.forEach((p) => {
      const k = String(p.jobId);
      const cur = payByJob.get(k) || 0;
      payByJob.set(k, cur + (p.amount || 0));
    });

    const out = [];
    for (const d of drivers) {
      const ds = await complianceSummary({
        ownerType: "driver",
        driverId: d._id,
      });
      const myJobs = byDriverJobs.get(String(d._id)) || [];
      const completed = myJobs.filter((j) => j.status === "Completed");
      const avgRating = completed.length
        ? completed.reduce(
            (s, j) => s + (fbByJob.get(String(j._id))?.rating || 0),
            0
          ) / completed.length
        : 0;
      const revenue = completed.reduce(
        (s, j) => s + (payByJob.get(String(j._id)) || 0),
        0
      );
      const split =
        d?.earningsSplit != null
          ? d.earningsSplit > 1
            ? d.earningsSplit / 100
            : d.earningsSplit
          : 0.6;
      const owed = revenue * split;

      out.push({
        _id: d._id,
        name: d.name,
        city: d.city,
        phone: d.phone,
        rating: d.rating || 0,
        docs: ds, // {total, approved, expired}
        stats: {
          completed: completed.length,
          avgRating,
          revenue,
          payoutOwed: owed,
        },
      });
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
});

// /api/admin/vendors/overview
r.get("/vendors/overview", async (_req, res, next) => {
  try {
    const vendors = await Vendor.find({}).lean();
    const ids = vendors.map((v) => String(v._id));
    const jobs = await Job.find({ vendorId: { $in: ids } }).lean();

    const byVendorJobs = new Map(ids.map((id) => [id, []]));
    jobs.forEach((j) => {
      const k = String(j.vendorId);
      if (byVendorJobs.has(k)) byVendorJobs.get(k).push(j);
    });

    const completedIds = jobs
      .filter((j) => j.status === "Completed")
      .map((j) => String(j._id));
    const fbs = await Feedback.find({ jobId: { $in: completedIds } }).lean();
    const pays = await Payment.find({ jobId: { $in: completedIds } }).lean();

    const fbByJob = new Map(fbs.map((f) => [String(f.jobId), f]));
    const payByJob = new Map();
    pays.forEach((p) => {
      const k = String(p.jobId);
      const cur = payByJob.get(k) || 0;
      payByJob.set(k, cur + (p.amount || 0));
    });

    const out = [];
    for (const v of vendors) {
      const vs = await complianceSummary({
        ownerType: "vendor",
        vendorId: v._id,
      });
      const myJobs = byVendorJobs.get(String(v._id)) || [];
      const completed = myJobs.filter((j) => j.status === "Completed");
      const avgRating = completed.length
        ? completed.reduce(
            (s, j) => s + (fbByJob.get(String(j._id))?.rating || 0),
            0
          ) / completed.length
        : 0;
      const revenue = completed.reduce(
        (s, j) => s + (payByJob.get(String(j._id)) || 0),
        0
      );
      const split =
        v?.earningsSplit != null
          ? v.earningsSplit > 1
            ? v.earningsSplit / 100
            : v.earningsSplit
          : 0.6;
      const owed = revenue * split;

      out.push({
        _id: v._id,
        name: v.name,
        city: v.city,
        phone: v.phone,
        rating: v.rating || 0,
        docs: vs,
        complianceStatus: v.complianceStatus || "pending",
        compliance: v.compliance || null,
        stats: {
          completed: completed.length,
          avgRating,
          revenue,
          payoutOwed: owed,
        },
      });
    }

    res.json(out);
  } catch (e) {
    next(e);
  }
});

export default r;


