import { Router } from "express";
import Vendor from "../models/Vendor.js";
import Job from "../models/Jobs.js";
import Message from "../models/Message.js";
import Feedback from "../models/Feedback.js";
import Customer from "../models/Customer.js";
import { decodeRequestActor } from "../lib/authTokens.js";
import {
  sendVendorPushNotifications,
  sendCustomerPushNotifications,
} from "../lib/push.js";
import { resolveClientBaseUrl } from "../lib/clientUrl.js";
import { getIo } from "../realtime/index.js";
import {
  getJobCreationAdvice,
  getVendorRecommendations,
  getOperationsDigest,
  getFollowupDraft,
  isAIEnabled,
} from "../lib/ai.js";

const router = Router();

const roomForJob = (jobId) => `messages/job/${jobId}`;

const sanitizeMessage = (doc) => {
  if (!doc) return null;
  const src = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(src._id),
    jobId: String(src.jobId),
    senderRole: src.senderRole,
    senderId: src.senderId ? String(src.senderId) : null,
    senderName: src.senderName || null,
    body: src.body || "",
    attachments: Array.isArray(src.attachments) ? src.attachments : [],
    readByCustomer: Boolean(src.readByCustomer),
    readByVendor: Boolean(src.readByVendor),
    createdAt: src.createdAt,
    updatedAt: src.updatedAt,
  };
};

router.get("/status", (_req, res) => {
  res.json({
    enabled: isAIEnabled(),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
});

router.post("/jobs/suggestions", async (req, res, next) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        message:
          "AI assistance is not configured. Set OPENAI_API_KEY to enable.",
      });
    }

    const payload = req.body || {};
    const job = payload.job || {};
    const company = payload.company || {};

    if (!job || !job.serviceType) {
      return res.status(400).json({
        message: "job.serviceType is required for generating suggestions.",
      });
    }

    const advice = await getJobCreationAdvice({ job, company });
    res.json({
      ok: true,
      advice,
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      return res.status(502).json({
        message: "OpenAI rejected the request. Check API credentials.",
      });
    }
    next(error);
  }
});

router.post("/vendors/recommendations", async (req, res, next) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        message:
          "AI assistance is not configured. Set OPENAI_API_KEY to enable.",
      });
    }

    const payload = req.body || {};
    const job = payload.job || {};
    const limit = Math.min(Math.max(Number(payload.limit) || 5, 1), 10);

    const vendorQuery = {
      active: { $ne: false },
    };

    const vendors = await Vendor.find(vendorQuery)
      .select(
        "_id name city services heavyDuty radiusKm updatesPaused complianceStatus compliance.lastCheckedAt compliance.missing active lastSeenAt"
      )
      .sort({ updatesPaused: 1, complianceStatus: 1, name: 1 })
      .limit(limit * 3)
      .lean();

    if (!vendors.length) {
      return res
        .status(404)
        .json({ message: "No vendors available for recommendation." });
    }

    const vendorIds = vendors.map((vendor) => vendor._id);
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const jobStats = await Job.aggregate([
      {
        $match: {
          vendorId: { $in: vendorIds },
          cancelled: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$vendorId",
          totalAssigned: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "Completed"] }, 1, 0],
            },
          },
          completedLast30: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "Completed"] },
                    { $gte: ["$completedAt", thirtyDaysAgo] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          openJobs: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Completed"] },
                    { $ne: ["$status", "Cancelled"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          arrivalMinutesTotal: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$arrivedAt", false] },
                    { $ifNull: ["$assignedAt", false] },
                  ],
                },
                {
                  $divide: [
                    { $subtract: ["$arrivedAt", "$assignedAt"] },
                    60000,
                  ],
                },
                0,
              ],
            },
          },
          arrivalSamples: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$arrivedAt", false] },
                    { $ifNull: ["$assignedAt", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          completionMinutesTotal: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$completedAt", false] },
                    { $ifNull: ["$assignedAt", false] },
                  ],
                },
                {
                  $divide: [
                    { $subtract: ["$completedAt", "$assignedAt"] },
                    60000,
                  ],
                },
                0,
              ],
            },
          },
          completionSamples: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$completedAt", false] },
                    { $ifNull: ["$assignedAt", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const statsMap = new Map();
    jobStats.forEach((entry) => {
      const averageArrival =
        entry.arrivalSamples > 0
          ? entry.arrivalMinutesTotal / entry.arrivalSamples
          : null;
      const averageCompletion =
        entry.completionSamples > 0
          ? entry.completionMinutesTotal / entry.completionSamples
          : null;

      statsMap.set(String(entry._id), {
        totalAssigned: entry.totalAssigned || 0,
        completed: entry.completed || 0,
        completedLast30: entry.completedLast30 || 0,
        openJobs: entry.openJobs || 0,
        avgArrivalMinutes: averageArrival,
        avgCompletionMinutes: averageCompletion,
      });
    });

    const vendorProfiles = vendors.slice(0, limit).map((vendor) => {
      const key = String(vendor._id);
      const stats = statsMap.get(key) || {
        totalAssigned: 0,
        completed: 0,
        completedLast30: 0,
        openJobs: 0,
        avgArrivalMinutes: null,
        avgCompletionMinutes: null,
      };

      const lastSeen =
        vendor.lastSeenAt instanceof Date
          ? Math.round((now - vendor.lastSeenAt.getTime()) / 60000)
          : null;

      return {
        id: key,
        name: vendor.name,
        city: vendor.city,
        services: vendor.services || [],
        heavyDuty: vendor.heavyDuty,
        radiusKm: vendor.radiusKm,
        complianceStatus: vendor.complianceStatus || "pending",
        updatesPaused: vendor.updatesPaused === true,
        active: vendor.active !== false,
        lastSeenMinutesAgo: lastSeen,
        stats,
      };
    });

    const advice = await getVendorRecommendations({
      job,
      vendors: vendorProfiles,
    });

    res.json({
      ok: true,
      candidates: vendorProfiles,
      recommended: advice.recommended,
      notes: advice.notes || [],
      raw: advice.raw,
      parseError: advice.parseError || null,
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      return res.status(502).json({
        message: "OpenAI rejected the request. Check API credentials.",
      });
    }
    next(error);
  }
});

router.post("/followups", async (req, res, next) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        message:
          "AI assistance is not configured. Set OPENAI_API_KEY to enable.",
      });
    }

    const {
      jobId,
      audience,
      reason = "",
      notes = "",
      vendorId,
    } = req.body || {};
    if (!jobId || !audience) {
      return res
        .status(400)
        .json({ message: "jobId and audience are required." });
    }

    const job = await Job.findById(jobId).lean();
    if (!job) return res.status(404).json({ message: "Job not found." });

    const now = new Date();
    const minutesSince = (date) =>
      date
        ? Math.round((now.getTime() - new Date(date).getTime()) / 60000)
        : null;

    const jobPayload = {
      id: String(job._id),
      serviceType: job.serviceType || "",
      status: job.status || "Unassigned",
      priority: job.priority || "normal",
      pickupAddress: job.pickupAddress || "",
      dropoffAddress: job.dropoffAddress || "",
      createdAt: job.createdAt || null,
      assignedAt: job.assignedAt || null,
      onTheWayAt: job.onTheWayAt || null,
      arrivedAt: job.arrivedAt || null,
      completedAt: job.completedAt || null,
      bidMode: job.bidMode || "open",
      fulfillment: job.vendorId ? "broker" : "market",
      biddingOpen: job.biddingOpen === true,
    };

    const messages = await Message.find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const lastMessages = messages.map((msg) => ({
      at: msg.createdAt,
      senderRole: msg.senderRole,
      senderName: msg.senderName || msg.senderRole,
      body: (msg.body || "").slice(0, 320),
    }));

    const minutesOpen = minutesSince(job.createdAt);
    const minutesSinceAssigned = minutesSince(job.assignedAt);

    const statusTimestamps = {
      Unassigned: job.createdAt,
      Assigned: job.assignedAt,
      OnTheWay: job.onTheWayAt,
      Arrived: job.arrivedAt,
      Completed: job.completedAt,
    };
    const minutesSinceStatusChange = minutesSince(statusTimestamps[job.status]);
    const minutesSinceLastMessage = lastMessages.length
      ? minutesSince(lastMessages[0].at)
      : null;

    let recipient = {};
    let followupReason = reason;

    if (audience === "vendor") {
      const targetVendorId = vendorId || job.vendorId;
      let vendorDoc = null;
      if (targetVendorId) {
        vendorDoc = await Vendor.findById(targetVendorId)
          .select(
            "name phone email city services heavyDuty active updatesPaused"
          )
          .lean();
      }
      if (!vendorDoc && !job.vendorName && !job.vendorPhone) {
        return res
          .status(400)
          .json({ message: "No vendor information available for follow-up." });
      }

      recipient = {
        type: "vendor",
        id: vendorDoc?._id ? String(vendorDoc._id) : null,
        name: vendorDoc?.name || job.vendorName || "Vendor",
        phone: vendorDoc?.phone || job.vendorPhone || "",
        email: vendorDoc?.email || "",
      };

      if (!followupReason) {
        if (job.status === "Assigned") {
          followupReason = "Vendor assigned but no confirmation of dispatch.";
        } else if (job.status === "Unassigned") {
          followupReason = "Job awaiting vendor acceptance.";
        } else {
          followupReason = `Vendor follow-up for status ${job.status}.`;
        }
      }

      jobPayload.vendor = {
        id: recipient.id,
        name: recipient.name,
        city: vendorDoc?.city || "",
        services: vendorDoc?.services || [],
        heavyDuty: vendorDoc?.heavyDuty || false,
        active: vendorDoc?.active !== false,
        updatesPaused: vendorDoc?.updatesPaused === true,
      };
    } else if (audience === "customer") {
      let customerDoc = null;
      if (job.customerId) {
        customerDoc = await Customer.findById(job.customerId)
          .select("name phone email")
          .lean();
      }

      recipient = {
        type: "customer",
        id: customerDoc?._id ? String(customerDoc._id) : null,
        name: customerDoc?.name || "Customer",
        phone: customerDoc?.phone || "",
        email: customerDoc?.email || "",
      };

      if (!followupReason) {
        if (job.status === "OnTheWay") {
          followupReason = "Provide customer with dispatch update and ETA.";
        } else if (job.status === "Arrived") {
          followupReason = "Confirm technician arrival and next steps.";
        } else if (job.status === "Completed") {
          followupReason =
            "Collect feedback and confirm customer satisfaction.";
        } else {
          followupReason = `Customer update for status ${job.status}.`;
        }
      }
    } else {
      return res
        .status(400)
        .json({ message: "Audience must be vendor or customer." });
    }

    const context = {
      reason: followupReason,
      minutesOpen,
      minutesSinceAssigned,
      minutesSinceStatusChange,
      minutesSinceLastMessage,
      status: job.status,
      priority: job.priority || "normal",
      notes: notes ? [notes] : [],
      lastMessages,
    };

    const draft = await getFollowupDraft({
      job: jobPayload,
      recipient,
      context,
    });

    const { raw, parseError, ...draftBody } = draft;

    res.json({
      ok: true,
      draft: draftBody,
      raw,
      parseError: parseError || null,
      job: jobPayload,
      recipient,
      context,
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      return res.status(502).json({
        message: "OpenAI rejected the request. Check API credentials.",
      });
    }
    next(error);
  }
});

router.post("/followups/send", async (req, res, next) => {
  try {
    let actor;
    try {
      actor = decodeRequestActor(req);
    } catch (error) {
      return res
        .status(error.status || 401)
        .json({ message: error.message || "Unauthorized" });
    }

    if (actor.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins may send follow-ups." });
    }

    const {
      jobId,
      audience,
      channel = "",
      subject = "",
      body = "",
    } = req.body || {};
    if (
      !jobId ||
      !audience ||
      !body ||
      typeof body !== "string" ||
      !body.trim()
    ) {
      return res
        .status(400)
        .json({ message: "jobId, audience, and body are required." });
    }

    if (audience !== "vendor" && audience !== "customer") {
      return res
        .status(400)
        .json({ message: "Audience must be vendor or customer." });
    }

    const job = await Job.findById(jobId)
      .select(
        "_id customerId vendorId customerName vendorName status pickupAddress dropoffAddress"
      )
      .lean();
    if (!job) return res.status(404).json({ message: "Job not found." });

    if (audience === "vendor" && !job.vendorId && !job.vendorName) {
      return res
        .status(400)
        .json({
          message: "Assign a vendor before sending a vendor follow-up.",
        });
    }
    if (audience === "customer" && !job.customerId && !job.customerName) {
      return res
        .status(400)
        .json({ message: "Customer contact unavailable for this job." });
    }

    const normalizedChannel =
      typeof channel === "string" && channel.trim().length
        ? channel.trim()
        : "in_app";

    const trimmedBody = typeof body === "string" ? body.trim() : "";
    const trimmedSubject = typeof subject === "string" ? subject.trim() : "";

    const finalBody =
      normalizedChannel === "email" && trimmedSubject
        ? "Subject: " + trimmedSubject + "\n\n" + trimmedBody
        : trimmedBody;

    const senderName = "Dispatch";

    const messageDoc = await Message.create({
      jobId: job._id,
      senderRole: "system",
      senderId: actor.id ? String(actor.id) : null,
      senderName,
      body: finalBody,
      attachments: [],
      readByCustomer: audience !== "customer",
      readByVendor: audience !== "vendor",
    });

    const sanitized = sanitizeMessage(messageDoc);
    const baseUrl = resolveClientBaseUrl(req);
    const messagePreview = finalBody.slice(0, 140);

    if (audience === "vendor" && job.vendorId) {
      await sendVendorPushNotifications([
        {
          vendorId: String(job.vendorId),
          jobId: job._id,
          title: "Dispatch follow-up",
          body: messagePreview,
          severity: "info",
          meta: {
            role: "vendor",
            jobId: job._id,
            kind: "followup",
            channel: normalizedChannel,
            route: "/vendor/app",
            dedupeKey: "vendor:job::followup:",
          },
        },
      ]);
    }

    if (audience === "customer" && job.customerId) {
      const customerRoute = "/status";
      await sendCustomerPushNotifications([
        {
          customerId: String(job.customerId),
          jobId: job._id,
          title: "Dispatch update",
          body: messagePreview,
          severity: "info",
          meta: {
            role: "customer",
            jobId: job._id,
            kind: "followup",
            channel: normalizedChannel,
            route: customerRoute,
            absoluteUrl: baseUrl ? baseUrl.replace(/\/$/, "") : null,
            dedupeKey: "customer:job::followup:",
          },
        },
      ]);
    }

    const io = getIo();
    if (io) {
      io.to(roomForJob(job._id)).emit("messages:new", sanitized);
    }

    res.status(201).json({
      ok: true,
      message: sanitized,
      audience,
      channel: normalizedChannel,
      subject,
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      return res.status(502).json({
        message: "OpenAI rejected the request. Check API credentials.",
      });
    }
    next(error);
  }
});

router.get("/reports/digest", async (req, res, next) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        message:
          "AI assistance is not configured. Set OPENAI_API_KEY to enable.",
      });
    }

    const range =
      typeof req.query.range === "string"
        ? req.query.range.toLowerCase()
        : "daily";
    const hours = range === "weekly" ? 24 * 7 : 24;
    const rangeLabel = range === "weekly" ? "Weekly" : "Daily";

    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const stalledCutoff = new Date(now.getTime() - 45 * 60 * 1000);

    const [
      createdJobs,
      completedJobs,
      urgentJobs,
      stalledJobs,
      recentMessages,
      lowFeedback,
    ] = await Promise.all([
      Job.find({ createdAt: { $gte: from } })
        .select("serviceType pickupAddress priority createdAt status _id")
        .sort({ createdAt: -1 })
        .lean(),
      Job.find({
        status: "Completed",
        completedAt: { $gte: from },
      })
        .select("serviceType pickupAddress completedAt createdAt _id")
        .sort({ completedAt: -1 })
        .lean(),
      Job.find({
        priority: "urgent",
        status: { $ne: "Completed" },
        cancelled: { $ne: true },
        createdAt: { $gte: from },
      })
        .select("serviceType pickupAddress status _id createdAt")
        .lean(),
      Job.find({
        status: "Unassigned",
        cancelled: { $ne: true },
        createdAt: { $lt: stalledCutoff },
      })
        .select("serviceType pickupAddress createdAt _id")
        .lean(),
      Message.find({ createdAt: { $gte: from } })
        .select("jobId senderRole senderName body createdAt")
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
      Feedback.find({
        createdAt: { $gte: from },
        rating: { $lte: 3 },
      })
        .select("jobId rating comment createdAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const jobLabel = (job) =>
      job?.serviceType
        ? `${job.serviceType} #${String(job._id).slice(-6).toUpperCase()}`
        : `Job #${String(job?._id || "")
            .slice(-6)
            .toUpperCase()}`;

    const highlights = [];
    if (createdJobs.length) {
      const mention = createdJobs
        .slice(0, 3)
        .map((job) => jobLabel(job))
        .join(", ");
      highlights.push(
        `${createdJobs.length} new jobs entered the queue. Latest: ${mention}.`
      );
    }
    if (completedJobs.length) {
      const mention = completedJobs
        .slice(0, 3)
        .map((job) => jobLabel(job))
        .join(", ");
      highlights.push(
        `${completedJobs.length} jobs completed successfully. Notables: ${mention}.`
      );
    }

    const blockers = [];
    if (stalledJobs.length) {
      const mention = stalledJobs
        .slice(0, 3)
        .map((job) => jobLabel(job))
        .join(", ");
      blockers.push(
        `${stalledJobs.length} unassigned jobs are older than 45 minutes. Examples: ${mention}.`
      );
    }
    if (lowFeedback.length) {
      const mention = lowFeedback
        .slice(0, 2)
        .map(
          (fb) =>
            `Rating ${fb.rating}/5 on job #${String(fb.jobId || "").slice(-6)}`
        )
        .join("; ");
      blockers.push(`Customer concerns flagged: ${mention}.`);
    }

    const escalations = urgentJobs.map(
      (job) =>
        `${jobLabel(job)} still ${job.status || "waiting"} (${Math.round(
          (now - job.createdAt) / 60000
        )}m open)`
    );

    const digestMessages = recentMessages.map((msg) => ({
      jobLabel: `#${String(msg.jobId || "")
        .slice(-6)
        .toUpperCase()}`,
      speaker: msg.senderName || msg.senderRole,
      body: (msg.body || "").slice(0, 240),
    }));

    const metrics = {
      newJobs: createdJobs.length,
      completedJobs: completedJobs.length,
      urgentOpenJobs: urgentJobs.length,
      stalledUnassigned: stalledJobs.length,
      negativeFeedback: lowFeedback.length,
      recentMessages: recentMessages.length,
    };

    const notes = [];
    if (range === "weekly") {
      const avgCompletion =
        completedJobs.length > 0
          ? (
              completedJobs.reduce((sum, job) => {
                const completedAt = job.completedAt
                  ? new Date(job.completedAt)
                  : null;
                const createdAt = job.createdAt
                  ? new Date(job.createdAt)
                  : null;
                if (completedAt && createdAt) {
                  return (
                    sum + (completedAt.getTime() - createdAt.getTime()) / 60000
                  );
                }
                return sum;
              }, 0) / completedJobs.length
            ).toFixed(1)
          : null;
      if (avgCompletion) {
        notes.push(
          `Average completion time this week: ${avgCompletion} minutes.`
        );
      }
    }

    const digest = await getOperationsDigest({
      rangeLabel,
      metrics,
      highlights,
      blockers,
      escalations,
      messages: digestMessages,
      notes,
    });

    res.json({
      ok: true,
      range: rangeLabel.toLowerCase(),
      generatedAt: now,
      from,
      digest,
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      return res.status(502).json({
        message: "OpenAI rejected the request. Check API credentials.",
      });
    }
    next(error);
  }
});

export default router;
