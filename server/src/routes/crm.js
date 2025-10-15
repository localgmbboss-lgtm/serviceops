import { Router } from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead.js";
import Job from "../models/Jobs.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import Feedback from "../models/Feedback.js";

const router = Router();

const leadStatuses = new Set(["new", "contacted", "qualified", "converted", "lost"]);
const leadStages = new Set(["inbox", "nurturing", "negotiation", "won", "lost"]);
const leadPriorities = new Set(["low", "medium", "high"]);
const responseChannels = new Set(["public", "private", "email", "sms", "system"]);

const sanitizeObjectId = (value) => {
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(value);
  return null;
};

const sanitizeLeadPayload = (payload = {}) => {
  const data = {};
  if (payload.name) data.name = String(payload.name).trim();
  if (payload.company) data.company = String(payload.company).trim();
  if (payload.email) data.email = String(payload.email).trim().toLowerCase();
  if (payload.phone) data.phone = String(payload.phone).trim();
  if (payload.source) data.source = String(payload.source).trim();
  if (payload.notes !== undefined) data.notes = String(payload.notes || "");

  if (leadStatuses.has(String(payload.status))) {
    data.status = String(payload.status);
  }
  if (leadStages.has(String(payload.pipelineStage))) {
    data.pipelineStage = String(payload.pipelineStage);
  }
  if (leadPriorities.has(String(payload.priority))) {
    data.priority = String(payload.priority);
  }

  if (Array.isArray(payload.tags)) {
    data.tags = payload.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  const assignedTo = sanitizeObjectId(payload.assignedTo);
  if (assignedTo) data.assignedTo = assignedTo;
  if (payload.assignedTo === null) data.assignedTo = null;

  const jobId = sanitizeObjectId(payload.jobId);
  if (jobId) data.jobId = jobId;
  if (payload.jobId === null) data.jobId = null;

  const nextFollowUp = payload.nextFollowUp || payload.followUp;
  if (nextFollowUp && typeof nextFollowUp === "object") {
    const scheduledAt = nextFollowUp.at ? new Date(nextFollowUp.at) : null;
    if (scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
      data.nextFollowUp = {
        at: scheduledAt,
        channel: nextFollowUp.channel || "call",
        note: nextFollowUp.note || "",
      };
    }
  } else if (payload.nextFollowUp === null) {
    data.nextFollowUp = null;
  }

  if (payload.lastContactedAt) {
    const last = new Date(payload.lastContactedAt);
    if (!Number.isNaN(last.getTime())) {
      data.lastContactedAt = last;
    }
  }

  return data;
};

router.get("/leads", async (req, res, next) => {
  try {
    const filter = {};
    const { status, stage, assigned, search } = req.query || {};
    if (status && leadStatuses.has(String(status))) {
      filter.status = String(status);
    }
    if (stage && leadStages.has(String(stage))) {
      filter.pipelineStage = String(stage);
    }
    if (assigned === "unassigned") {
      filter.assignedTo = null;
    } else if (assigned && mongoose.isValidObjectId(assigned)) {
      filter.assignedTo = new mongoose.Types.ObjectId(assigned);
    }
    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$or = [
        { name: new RegExp(term, "i") },
        { company: new RegExp(term, "i") },
        { phone: new RegExp(term, "i") },
        { email: new RegExp(term, "i") },
      ];
    }

    const leads = await Lead.find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    res.json({ results: leads, count: leads.length });
  } catch (error) {
    next(error);
  }
});

router.post("/leads", async (req, res, next) => {
  try {
    const payload = sanitizeLeadPayload(req.body || {});
    if (!payload.name) {
      return res.status(400).json({ message: "Lead name is required." });
    }
    const lead = await Lead.create(payload);
    res.status(201).json(lead);
  } catch (error) {
    next(error);
  }
});

router.patch("/leads/:leadId", async (req, res, next) => {
  try {
    const { leadId } = req.params;
    if (!mongoose.isValidObjectId(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }

    const payload = sanitizeLeadPayload(req.body || {});
    if (!Object.keys(payload).length) {
      return res.status(400).json({ message: "No changes supplied" });
    }

    const lead = await Lead.findByIdAndUpdate(
      leadId,
      { $set: payload },
      { new: true }
    ).lean();
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    res.json(lead);
  } catch (error) {
    next(error);
  }
});

router.post("/leads/:leadId/convert", async (req, res, next) => {
  try {
    const { leadId } = req.params;
    if (!mongoose.isValidObjectId(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const { jobId } = req.body || {};
    const jobObjectId = sanitizeObjectId(jobId);
    if (jobObjectId) {
      lead.convertedJobId = jobObjectId;
    }
    lead.status = "converted";
    lead.pipelineStage = "won";
    lead.nextFollowUp = null;
    lead.lastContactedAt = new Date();

    await lead.save();
    res.json(lead.toObject());
  } catch (error) {
    next(error);
  }
});

router.delete("/leads/:leadId", async (req, res, next) => {
  try {
    const { leadId } = req.params;
    if (!mongoose.isValidObjectId(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }
    await Lead.findByIdAndDelete(leadId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/reviews", async (req, res, next) => {
  try {
    const { status, visibility, rating, limit = 120 } = req.query || {};
    const filter = {};
    if (status && typeof status === "string") {
      filter.status = status;
    }
    if (visibility && typeof visibility === "string") {
      filter.visibility = visibility;
    }
    if (rating && Number.isFinite(Number(rating))) {
      filter.rating = Number(rating);
    }

    const reviews = await Feedback.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 120, 250))
      .lean();

    const jobIds = reviews
      .map((review) => review.jobId)
      .filter((id) => mongoose.isValidObjectId(id));

    const jobs = await Job.find(
      { _id: { $in: jobIds } },
      {
        _id: 1,
        pickupAddress: 1,
        serviceType: 1,
        vendorId: 1,
        status: 1,
        completedAt: 1,
      }
    ).lean();

    const vendorIds = jobs
      .map((job) => job.vendorId)
      .filter((id) => mongoose.isValidObjectId(id));

    const customerIds = reviews
      .map((review) => review.customerId)
      .filter((id) => mongoose.isValidObjectId(id));

    const [vendors, customers] = await Promise.all([
      Vendor.find(
        { _id: { $in: vendorIds } },
        { _id: 1, name: 1, city: 1, phone: 1 }
      ).lean(),
      Customer.find(
        { _id: { $in: customerIds } },
        { _id: 1, firstName: 1, lastName: 1 }
      ).lean(),
    ]);

    const jobMap = new Map(jobs.map((job) => [String(job._id), job]));
    const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
    const customerMap = new Map(
      customers.map((customer) => [String(customer._id), customer])
    );

    const results = reviews.map((review) => {
      const job = jobMap.get(String(review.jobId));
      const vendor = job ? vendorMap.get(String(job.vendorId)) : null;
      const customer = review.customerId
        ? customerMap.get(String(review.customerId))
        : null;
      return {
        ...review,
        job: job || null,
        vendor: vendor || null,
        customer: customer
          ? {
              _id: customer._id,
              name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
            }
          : null,
      };
    });

    res.json({ results, count: results.length });
  } catch (error) {
    next(error);
  }
});

router.patch("/reviews/:reviewId", async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    if (!mongoose.isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" });
    }
    const payload = req.body || {};
    const update = {};

    if (payload.status) {
      update.status = String(payload.status);
    }
    if (payload.visibility) {
      update.visibility = String(payload.visibility);
    }
    if (Array.isArray(payload.tags)) {
      update.tags = payload.tags.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (payload.assignedTo === null) {
      update.assignedTo = null;
    } else {
      const assignedTo = sanitizeObjectId(payload.assignedTo);
      if (assignedTo) update.assignedTo = assignedTo;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "No updates supplied" });
    }

    const doc = await Feedback.findByIdAndUpdate(
      reviewId,
      { $set: update },
      { new: true }
    ).lean();
    if (!doc) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json(doc);
  } catch (error) {
    next(error);
  }
});

router.post("/reviews/:reviewId/respond", async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    if (!mongoose.isValidObjectId(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" });
    }
    const { body, actor, channel } = req.body || {};
    if (!body || !String(body).trim()) {
      return res.status(400).json({ message: "Response body required" });
    }

    const entry = {
      at: new Date(),
      body: String(body).trim(),
      actor: actor ? String(actor).trim() : "operator",
      channel: responseChannels.has(String(channel))
        ? String(channel)
        : "public",
    };

    const update = {
      $push: { responseLog: entry },
      $set: {},
    };

    if (entry.channel === "public") {
      update.$set.lastPublicReplyAt = entry.at;
    }

    const doc = await Feedback.findByIdAndUpdate(reviewId, update, {
      new: true,
    }).lean();
    if (!doc) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json(doc);
  } catch (error) {
    next(error);
  }
});

export default router;
