import { Router } from "express";
import Payment from "../models/Payment.js";
import Expense from "../models/Expense.js";
import Job from "../models/Jobs.js";
import Vendor from "../models/Vendor.js";
import Settings from "../models/Settings.js";

const router = Router();

const DAYS = 864e5;

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed?.getTime()) ? parsed : fallback;
};

const toCurrency = (value = 0) => {
  const num = Number(value) || 0;
  return Math.round(num * 100) / 100;
};

const normalizeSplit = (raw, fallback) => {
  if (raw == null) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  if (num <= 0) return 0;
  if (num <= 1) return Math.min(1, Math.max(0, num));
  return Math.min(1, Math.max(0, num / 100));
};

const inferCity = ({ job, vendor }) => {
  if (vendor?.city) return vendor.city;
  if (typeof job?.pickupAddress === "string") {
    const [first] = job.pickupAddress.split(",");
    if (first && first.trim()) return first.trim();
  }
  return "-";
};

router.get("/", async (req, res, next) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * DAYS);

    const from = parseDate(req.query.from, defaultFrom);
    const to = parseDate(req.query.to, now);

    const paymentFilter = { receivedAt: { $gte: from, $lte: to } };
    const expenseFilter = { date: { $gte: from, $lte: to } };

    const [payments, expenses, settings] = await Promise.all([
      Payment.find(paymentFilter).sort({ receivedAt: -1 }).lean(),
      Expense.find(expenseFilter).sort({ date: -1 }).lean(),
      Settings.findOne().lean(),
    ]);

    const jobIds = [
      ...new Set(
        payments
          .map((p) => (p.jobId ? String(p.jobId) : null))
          .filter(Boolean)
      ),
    ];

    const jobs = jobIds.length
      ? await Job.find({ _id: { $in: jobIds } })
          .select("vendorId pickupAddress")
          .lean()
      : [];

    const vendorIds = [
      ...new Set(jobs.map((j) => (j.vendorId ? String(j.vendorId) : null)).filter(Boolean)),
    ];

    const vendors = vendorIds.length
      ? await Vendor.find({ _id: { $in: vendorIds } })
          .select("name city earningsSplit updatesPaused active")
          .lean()
      : [];

    const vendorMap = new Map(vendors.map((v) => [String(v._id), v]));
    const jobMap = new Map(jobs.map((j) => [String(j._id), j]));

    const totalsByJob = new Map();
    let revenueTotal = 0;
    payments.forEach((p) => {
      const amount = Number(p.amount) || 0;
      revenueTotal += amount;
      const jobId = p.jobId ? String(p.jobId) : null;
      if (!jobId) return;
      totalsByJob.set(jobId, (totalsByJob.get(jobId) || 0) + amount);
    });

    const defaultSplit = normalizeSplit(
      settings?.defaults?.defaultEarningsSplit,
      0.6
    );

    const vendorTotals = new Map();
    const cityTotals = new Map();
    let payoutsTotal = 0;

    totalsByJob.forEach((amount, jobId) => {
      const job = jobMap.get(jobId) || null;
      const vendorId = job?.vendorId ? String(job.vendorId) : null;
      const vendor = vendorId ? vendorMap.get(vendorId) : null;

      const split = normalizeSplit(
        vendor?.earningsSplit,
        defaultSplit
      );
            const owed = amount * split;
            payoutsTotal += owed;

      const key = vendorId || "unassigned";
      if (!vendorTotals.has(key)) {
        vendorTotals.set(key, {
          vendorId: vendorId || "unassigned",
          name: vendor?.name || job?.vendorName || "Unassigned",
          city: inferCity({ job, vendor }),
          amount: 0,
        });
      }
      const entry = vendorTotals.get(key);
            entry.amount += owed;

      const city = entry.city || "-";
            cityTotals.set(city, (cityTotals.get(city) || 0) + amount);
    });

    const expensesTotal = expenses.reduce(
      (sum, exp) => sum + (Number(exp.amount) || 0),
      0
    );

    const response = {
      range: { from: from.toISOString(), to: to.toISOString() },
      revenue: { total: toCurrency(revenueTotal) },
      payouts: {
        total: toCurrency(payoutsTotal),
        byVendor: Array.from(vendorTotals.values()).sort(
          (a, b) => b.amount - a.amount
        ),
      },
      expenses: { total: toCurrency(expensesTotal) },
      net: toCurrency(revenueTotal - payoutsTotal - expensesTotal),
      byCity: Array.from(cityTotals.entries())
        .map(([city, total]) => ({ city, total: toCurrency(total) }))
        .sort((a, b) => b.total - a.total),
      latest: {
        payments: payments.slice(0, 10).map((p) => ({
          _id: String(p._id),
          jobId: p.jobId ? String(p.jobId) : null,
          amount: toCurrency(p.amount),
          method: p.method,
          receivedAt: p.receivedAt,
          note: p.note || "",
        })),
        expenses: expenses.slice(0, 10).map((exp) => ({
          _id: String(exp._id),
          title: exp.title,
          amount: toCurrency(exp.amount),
          type: exp.type,
          date: exp.date,
          notes: exp.notes || "",
        })),
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
