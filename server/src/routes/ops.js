import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import Vendor from "../models/Vendor.js";
import Feedback from "../models/Feedback.js";
import Document from "../models/Document.js";
import Settings from "../models/Settings.js";

const router = Router();

const SLA_MINUTES = {
  emergency: 15,
  urgent: 30,
  standard: 45,
};

const toObjectId = (value) => {
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(value);
  return null;
};

const toMinutes = (ms) => Math.round(ms / 60000);

const toRadians = (deg) => (deg * Math.PI) / 180;

const haversineKm = (aLat, aLng, bLat, bLng) => {
  const lat1 = Number(aLat);
  const lat2 = Number(bLat);
  const lng1 = Number(aLng);
  const lng2 = Number(bLng);
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity;
  }
  const R = 6371; // km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

const computeQueueEntry = (job, now) => {
  const createdAt = job.created || job.createdAt || now;
  const assignedAt = job.assignedAt || job.assigned || null;
  const slaMinutes = SLA_MINUTES[job.urgency] || SLA_MINUTES.standard;
  const openMinutes = toMinutes(now - new Date(createdAt));
  const sinceAssigned = assignedAt ? toMinutes(now - new Date(assignedAt)) : 0;
  const minutesRemaining = slaMinutes - openMinutes;
  const atRisk = minutesRemaining <= 0;
  const severe = minutesRemaining <= -10;
  return {
    jobId: job._id,
    serviceType: job.serviceType || "Service",
    priority: job.priority || "normal",
    status: job.status,
    createdAt,
    pickupAddress: job.pickupAddress || null,
    vendorId: job.vendorId || null,
    vendorName: job.vendorName || null,
    openMinutes,
    sinceAssignedMinutes: sinceAssigned,
    slaMinutes,
    minutesRemaining,
    atRisk,
    severe,
    escalated: Boolean(job.escalatedAt),
    urgency: job.urgency || "standard",
  };
};

const buildVendorScorecard = ({ jobs, feedbackByJob, vendorDoc }) => {
  const score = {
    vendorId: vendorDoc?._id || null,
    name: vendorDoc?.name || "Vendor",
    city: vendorDoc?.city || "",
    services: Array.isArray(vendorDoc?.services)
      ? vendorDoc.services
      : [],
    active: vendorDoc?.active !== false,
    heavyDuty: vendorDoc?.heavyDuty || false,
    stats: {
      assigned: 0,
      completed: 0,
      cancelled: 0,
      avgArrivalMinutes: null,
      slaHitRate: null,
      avgRating: null,
      gross: 0,
      commission: 0,
      avgCompletionMinutes: null,
    },
    compliance: {
      status: vendorDoc?.complianceStatus || "pending",
      issues:
        Array.isArray(vendorDoc?.compliance?.missing) &&
        vendorDoc.compliance.missing.length
          ? vendorDoc.compliance.missing.map((missing) => ({
              key: missing.key,
              label: missing.label,
              reason: missing.reason || "",
            }))
          : [],
      nextCheck:
        vendorDoc?.compliance?.lastCheckedAt || vendorDoc?.updatedAt || null,
    },
  };

  if (!jobs.length) {
    return score;
  }

  let arrivalTotal = 0;
  let arrivalCount = 0;
  let completionTotal = 0;
  let completionCount = 0;
  let slaHits = 0;

  for (const job of jobs) {
    score.stats.assigned += 1;
    if (job.cancelled) {
      score.stats.cancelled += 1;
    }
    const price = Number(job.finalPrice || job.quotedPrice || 0);
    score.stats.gross += price;
    const commissionAmount = Number(job.commission?.amount || 0);
    score.stats.commission += commissionAmount;

    if (job.status === "Completed") {
      score.stats.completed += 1;
    }

    if (job.arrivedAt && job.assignedAt) {
      const arrivalMinutes = toMinutes(
        new Date(job.arrivedAt) - new Date(job.assignedAt)
      );
      if (Number.isFinite(arrivalMinutes)) {
        arrivalTotal += arrivalMinutes;
        arrivalCount += 1;
        const slaTarget = SLA_MINUTES[job.urgency] || SLA_MINUTES.standard;
        if (arrivalMinutes <= slaTarget) {
          slaHits += 1;
        }
      }
    }

    if (job.completedAt && job.assignedAt) {
      const completionMinutes = toMinutes(
        new Date(job.completedAt) - new Date(job.assignedAt)
      );
      if (Number.isFinite(completionMinutes)) {
        completionTotal += completionMinutes;
        completionCount += 1;
      }
    }
  }

  if (arrivalCount > 0) {
    score.stats.avgArrivalMinutes = Math.round((arrivalTotal / arrivalCount) * 10) / 10;
    score.stats.slaHitRate = Math.round((slaHits / arrivalCount) * 100);
  }
  if (completionCount > 0) {
    score.stats.avgCompletionMinutes =
      Math.round((completionTotal / completionCount) * 10) / 10;
  }

  const ratings = jobs
    .map((job) => feedbackByJob.get(String(job._id))?.rating)
    .filter((rating) => Number.isFinite(rating));

  if (ratings.length) {
    const avgRating =
      ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
    score.stats.avgRating = Math.round(avgRating * 10) / 10;
  }

  return score;
};

router.get("/mission-control", async (_req, res, next) => {
  try {
    const now = new Date();
    const settingsDoc = await Settings.findOne({}, { automation: 1 }).lean();
    const remindDays =
      settingsDoc?.automation?.compliance?.remindBeforeExpiryDays || 7;

    const openJobs = await Job.find(
      {
        cancelled: { $ne: true },
        status: { $ne: "Completed" },
      },
      {
        _id: 1,
        created: 1,
        createdAt: 1,
        assignedAt: 1,
        status: 1,
        serviceType: 1,
        priority: 1,
        escalatedAt: 1,
        urgency: 1,
        vendorId: 1,
        vendorName: 1,
        pickupAddress: 1,
        pickupLat: 1,
        pickupLng: 1,
      }
    )
      .sort({ created: 1 })
      .lean();

    const queue = openJobs.map((job) => computeQueueEntry(job, now));
    const escalations = queue
      .filter((item) => item.atRisk || item.escalated)
      .sort((a, b) => a.minutesRemaining - b.minutesRemaining);

    const queueVendorIds = new Set(
      openJobs
        .map((job) => (job.vendorId ? String(job.vendorId) : null))
        .filter(Boolean)
    );

    const activeVendorDocs = await Vendor.find(
      { active: { $ne: false } },
      {
        _id: 1,
        name: 1,
        phone: 1,
        city: 1,
        services: 1,
        lat: 1,
        lng: 1,
        heavyDuty: 1,
        updatesPaused: 1,
        complianceStatus: 1,
        compliance: 1,
        lastSeenAt: 1,
      }
    ).lean();

    const backlogAgg = await Job.aggregate([
      {
        $match: {
          cancelled: { $ne: true },
          status: { $ne: "Completed" },
          vendorId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$vendorId",
          activeJobs: { $sum: 1 },
        },
      },
    ]);

    const backlogMap = new Map(
      backlogAgg.map((row) => [String(row._id), row.activeJobs])
    );

    const vendorMap = new Map(
      activeVendorDocs.map((vendor) => [String(vendor._id), vendor])
    );

    const routeSuggestions = [];
    const unassignedJobs = openJobs.filter((job) => !job.vendorId);

    for (const job of unassignedJobs) {
      const suggestions = activeVendorDocs
        .map((vendor) => {
          const distanceKm = haversineKm(
            vendor.lat,
            vendor.lng,
            job.pickupLat,
            job.pickupLng
          );
          const backlog = backlogMap.get(String(vendor._id)) || 0;
          const paused = vendor.updatesPaused === true;

          if (!Number.isFinite(distanceKm)) return null;

          const score = distanceKm + backlog * 2 + (paused ? 5 : 0);
          return {
            vendorId: vendor._id,
            name: vendor.name,
            distanceKm: Math.round(distanceKm * 10) / 10,
            backlog,
            paused,
            score,
            city: vendor.city || "",
            services: vendor.services || [],
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5);

      routeSuggestions.push({
        jobId: job._id,
        serviceType: job.serviceType || "Service",
        pickupAddress: job.pickupAddress || "",
        urgency: job.urgency || "standard",
        suggestions,
      });
    }

    const since = new Date(Date.now() - 45 * 864e5);

    const recentJobs = await Job.find(
      {
        vendorId: { $ne: null },
        created: { $gte: since },
      },
      {
        _id: 1,
        vendorId: 1,
        status: 1,
        cancelled: 1,
        finalPrice: 1,
        quotedPrice: 1,
        commission: 1,
        urgency: 1,
        assignedAt: 1,
        arrivedAt: 1,
        completedAt: 1,
      }
    ).lean();

    const feedbackDocs = await Feedback.find(
      { createdAt: { $gte: since } },
      { jobId: 1, rating: 1 }
    ).lean();
    const feedbackByJob = new Map(
      feedbackDocs.map((doc) => [String(doc.jobId), doc])
    );

    const jobsByVendor = new Map();
    for (const job of recentJobs) {
      const key = String(job.vendorId);
      if (!jobsByVendor.has(key)) {
        jobsByVendor.set(key, []);
      }
      jobsByVendor.get(key).push(job);
    }

    const vendorScorecards = Array.from(jobsByVendor.entries()).map(
      ([vendorId, jobs]) =>
        buildVendorScorecard({
          jobs,
          feedbackByJob,
          vendorDoc: vendorMap.get(vendorId),
        })
    );

    const expiringDocs = await Document.find(
      {
        ownerType: "vendor",
        expiresAt: {
          $gte: now,
          $lte: new Date(now.getTime() + remindDays * 864e5),
        },
      },
      {
        _id: 1,
        title: 1,
        vendorId: 1,
        expiresAt: 1,
        status: 1,
        requirementKey: 1,
      }
    )
      .sort({ expiresAt: 1 })
      .lean();

    const complianceTasks = [];
    for (const doc of expiringDocs.slice(0, 20)) {
      const vendor = vendorMap.get(String(doc.vendorId));
      complianceTasks.push({
        type: "expiry",
        vendorId: doc.vendorId,
        vendorName: vendor?.name || "Vendor",
        documentId: doc._id,
        title: doc.title,
        expiresAt: doc.expiresAt,
        status: doc.status,
      });
    }

    for (const vendor of activeVendorDocs) {
      if (
        Array.isArray(vendor?.compliance?.missing) &&
        vendor.compliance.missing.length
      ) {
        vendor.compliance.missing.slice(0, 3).forEach((missing) => {
          complianceTasks.push({
            type: "missing",
            vendorId: vendor._id,
            vendorName: vendor.name || "Vendor",
            key: missing.key,
            label: missing.label,
            reason: missing.reason || "",
          });
        });
      }
    }

    res.json({
      queue,
      escalations,
      routeSuggestions,
      vendorScorecards,
      complianceTasks,
      vendorBacklog: backlogAgg.map((item) => ({
        vendorId: item._id,
        activeJobs: item.activeJobs,
      })),
      queueVendors: Array.from(queueVendorIds),
      generatedAt: now,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/vendor-scorecards", async (_req, res, next) => {
  try {
    const now = new Date();
    const since = new Date(Date.now() - 90 * 864e5);

    const [recentJobs, feedbackDocs, vendors] = await Promise.all([
      Job.find(
        { vendorId: { $ne: null }, created: { $gte: since } },
        {
          _id: 1,
          vendorId: 1,
          status: 1,
          cancelled: 1,
          finalPrice: 1,
          quotedPrice: 1,
          commission: 1,
          urgency: 1,
          assignedAt: 1,
          arrivedAt: 1,
          completedAt: 1,
        }
      ).lean(),
      Feedback.find(
        { createdAt: { $gte: since } },
        { jobId: 1, rating: 1 }
      ).lean(),
      Vendor.find(
        {},
        {
          _id: 1,
          name: 1,
          city: 1,
          services: 1,
          complianceStatus: 1,
          compliance: 1,
          active: 1,
          heavyDuty: 1,
        }
      ).lean(),
    ]);

    const feedbackByJob = new Map(
      feedbackDocs.map((doc) => [String(doc.jobId), doc])
    );
    const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

    const jobsByVendor = new Map();
    for (const job of recentJobs) {
      const key = String(job.vendorId);
      if (!jobsByVendor.has(key)) {
        jobsByVendor.set(key, []);
      }
      jobsByVendor.get(key).push(job);
    }

    const scorecards = Array.from(jobsByVendor.entries()).map(
      ([vendorId, jobs]) =>
        buildVendorScorecard({
          jobs,
          feedbackByJob,
          vendorDoc: vendorMap.get(vendorId),
        })
    );

    res.json({
      generatedAt: now,
      scorecards,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
