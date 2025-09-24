import { Router } from "express";
import Job from "../models/Jobs.js";
import Driver from "../models/Driver.js";
import Customer from "../models/Customer.js";
import mongoose from "mongoose";

const router = Router();

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d : fallback;
}
function csvEscape(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sendCsv(res, name, rows) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(rows.map((r) => r.map(csvEscape).join(",")).join("\n"));
}

/**
 * GET /api/exports/jobs.csv
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD, status?, service?
 */
router.get("/jobs.csv", async (req, res, next) => {
  try {
    const now = new Date();
    const from = parseDate(
      req.query.from,
      new Date(now.getTime() - 30 * 864e5)
    );
    const to = parseDate(req.query.to, now);

    const match = {
      created: { $gte: from, $lte: to },
    };
    if (req.query.status) match.status = req.query.status;
    if (req.query.service) match.serviceType = req.query.service;

    // Join Customer + Driver (for names/city)
    const pipeline = [
      { $match: match },
      { $sort: { created: -1 } },
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          created: 1,
          completed: 1,
          status: 1,
          serviceType: 1,
          pickupAddress: 1,
          dropoffAddress: 1,
          quotedPrice: 1,
          priority: 1,
          customerName: "$customer.name",
          customerPhone: "$customer.phone",
          driverName: "$driver.name",
          driverCity: "$driver.city",
        },
      },
    ];

    const docs = await Job.aggregate(pipeline).exec();

    const header = [
      "created",
      "completed",
      "status",
      "serviceType",
      "pickupAddress",
      "dropoffAddress",
      "quotedPrice",
      "priority",
      "customerName",
      "customerPhone",
      "driverName",
      "driverCity",
    ];
    const rows = [header];
    for (const j of docs) {
      rows.push([
        j.created ? new Date(j.created).toISOString() : "",
        j.completed ? new Date(j.completed).toISOString() : "",
        j.status || "",
        j.serviceType || "",
        j.pickupAddress || "",
        j.dropoffAddress || "",
        j.quotedPrice ?? "",
        j.priority || "",
        j.customerName || "",
        j.customerPhone || "",
        j.driverName || "",
        j.driverCity || "",
      ]);
    }
    const name = `jobs_${from.toISOString().slice(0, 10)}_${to
      .toISOString()
      .slice(0, 10)}.csv`;
    sendCsv(res, name, rows);
  } catch (e) {
    next(e);
  }
});

export default router;
