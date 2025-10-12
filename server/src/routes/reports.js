import { Router } from "express";
import Job from "../models/Jobs.js";
import Vendor from "../models/Vendor.js";
import Feedback from "../models/Feedback.js";

const router = Router();

const parseDate = (s, fallback) => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d : fallback;
};

/* ========== SUMMARY ========== */
/**
 * GET /api/reports/summary
 * Minimal KPIs used across the app
 */
router.get("/summary", async (_req, res, next) => {
  try {
    const [completedCount, avgRevAgg, avgRatingAgg] = await Promise.all([
      Job.countDocuments({ status: "Completed" }),
      Job.aggregate([
        { $match: { quotedPrice: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: "$quotedPrice" } } },
      ]),
      Feedback.aggregate([{ $group: { _id: null, avg: { $avg: "$rating" } } }]),
    ]);

    const avgRevenue = avgRevAgg[0]?.avg || 0;
    const avgRating = avgRatingAgg[0]?.avg || 0;

    res.json({ completedCount, avgRevenue, avgRating });
  } catch (e) {
    next(e);
  }
});

/* ========== RANGE (FILTERABLE REPORTS) ========== */
/**
 * GET /api/reports/range
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD, service?, city?
 * Returns: { from, to, totals, byService, byCity, topVendors, satisfaction }
 */
router.get("/range", async (req, res, next) => {
  try {
    const now = new Date();
    const from = parseDate(req.query.from, new Date(now.getTime() - 7 * 864e5));
    const to = parseDate(req.query.to, now);
    const service = (req.query.service || "").trim();
    const city = (req.query.city || "").trim();

    const match = { created: { $gte: from, $lte: to } };
    if (service) match.serviceType = service;

    // Base pipeline with optional city filter via vendor lookup
    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    ];
    if (city) pipeline.push({ $match: { "vendor.city": city } });
    pipeline.push({
      $project: {
        status: 1,
        serviceType: 1,
        quotedPrice: 1,
        vendorCity: "$vendor.city",
      },
    });

    const jobs = await Job.aggregate(pipeline);

    const totals = {
      count: jobs.length,
      completed: jobs.filter((j) => j.status === "Completed").length,
      gross: jobs.reduce((s, j) => s + (Number(j.quotedPrice) || 0), 0),
    };

    const byService = {};
    for (const j of jobs) {
      const k = j.serviceType || "Other";
      byService[k] = (byService[k] || 0) + 1;
    }

    const byCity = {};
    for (const j of jobs) {
      const k = j.vendorCity || "-";
      byCity[k] = (byCity[k] || 0) + 1;
    }

    // Top vendors by completed & revenue
    const topVendors = await Job.aggregate([
      { $match: { ...match, status: "Completed" } },
      {
        $group: {
          _id: "$vendorId",
          jobs: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$quotedPrice", 0] } },
        },
      },
      { $sort: { jobs: -1, revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          vendorId: "$_id",
          name: "$vendor.name",
          city: "$vendor.city",
          jobs: 1,
          revenue: 1,
        },
      },
    ]);

    // Satisfaction split (5* vs private (<5))
    const fb = await Feedback.find(
      { createdAt: { $gte: from, $lte: to } },
      { rating: 1 }
    ).lean();
    const satisfaction = {
      five: fb.filter((x) => x.rating === 5).length,
      private: fb.filter((x) => x.rating < 5).length,
    };

    res.json({ from, to, totals, byService, byCity, topVendors, satisfaction });
  } catch (e) {
    next(e);
  }
});

/* ========== DASHBOARD ========== */
/**
 * GET /api/reports/dashboard
 * Returns: { revenue: {day|week|month}, cityTrend, topPerformers, satisfaction }
 */
router.get("/dashboard", async (_req, res, next) => {
  try {
    const now = new Date();
    const dayFrom = new Date(now.getTime() - 1 * 864e5);
    const weekFrom = new Date(now.getTime() - 7 * 864e5);
    const monthFrom = new Date(now.getTime() - 30 * 864e5);

    async function grossBetween(from, to) {
      const agg = await Job.aggregate([
        { $match: { created: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: null,
            sum: { $sum: { $ifNull: ["$quotedPrice", 0] } },
          },
        },
      ]);
      return agg[0]?.sum || 0;
    }

    const [dayGross, weekGross, monthGross] = await Promise.all([
      grossBetween(dayFrom, now),
      grossBetween(weekFrom, now),
      grossBetween(monthFrom, now),
    ]);

    const revenue = {
      day: { gross: dayGross, payouts: 0, expenses: 0, net: dayGross },
      week: { gross: weekGross, payouts: 0, expenses: 0, net: weekGross },
      month: { gross: monthGross, payouts: 0, expenses: 0, net: monthGross },
    };

    // City trend (last 14 days)
    const trendFrom = new Date(now.getTime() - 14 * 864e5);
    const dayFmt = { $dateToString: { format: "%Y-%m-%d", date: "$created" } };
    const trendAgg = await Job.aggregate([
      { $match: { created: { $gte: trendFrom, $lte: now } } },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { day: dayFmt, city: "$vendor.city" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          day: "$_id.day",
          city: { $ifNull: ["$_id.city", "-"] },
          count: 1,
        },
      },
      { $sort: { day: 1 } },
    ]);

    // Build labels & series
    const labels = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 864e5);
      labels.push(d.toISOString().slice(0, 10));
    }
    const cities = [...new Set(trendAgg.map((r) => r.city))];
    const series = {};
    cities.forEach((c) => (series[c] = labels.map(() => 0)));
    trendAgg.forEach((r) => {
      const idx = labels.indexOf(r.day);
      if (idx >= 0) series[r.city][idx] = r.count;
    });

    // Daily completed jobs vs revenue trend (14 days)
    const workAgg = await Job.aggregate([
      {
        $match: {
          created: { $gte: trendFrom, $lte: now },
          status: "Completed",
        },
      },
      {
        $group: {
          _id: dayFmt,
          jobs: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$quotedPrice", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          day: "$_id",
          jobs: 1,
          revenue: 1,
        },
      },
      { $sort: { day: 1 } },
    ]);

    const jobsSeries = labels.map(() => 0);
    const revenueSeries = labels.map(() => 0);
    workAgg.forEach((r) => {
      const idx = labels.indexOf(r.day);
      if (idx >= 0) {
        jobsSeries[idx] = r.jobs;
        revenueSeries[idx] = Number(r.revenue || 0);
      }
    });

    // Top performers (30 days, completed)
    const perfAgg = await Job.aggregate([
      {
        $match: {
          created: { $gte: monthFrom, $lte: now },
          status: "Completed",
        },
      },
      {
        $group: {
          _id: "$vendorId",
          jobs: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$quotedPrice", 0] } },
        },
      },
      { $sort: { jobs: -1, revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          vendorId: "$_id",
          name: "$vendor.name",
          city: "$vendor.city",
          jobs: 1,
          revenue: 1,
        },
      },
    ]);

    // Satisfaction (30 days)
    const fb = await Feedback.find(
      { createdAt: { $gte: monthFrom, $lte: now } },
      { rating: 1 }
    ).lean();
    const satisfaction = {
      five: fb.filter((x) => x.rating === 5).length,
      private: fb.filter((x) => x.rating < 5).length,
    };

    res.json({
      revenue,
      cityTrend: { labels, series },
      workVsRevenue: {
        labels,
        jobs: jobsSeries,
        revenue: revenueSeries,
      },
      topPerformers: perfAgg,
      satisfaction,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
