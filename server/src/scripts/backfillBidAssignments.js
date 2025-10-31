import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import Job from "../models/Jobs.js";
import Bid from "../models/Bid.js";
import Vendor from "../models/Vendor.js";

const normalizePhone = (input = "") => {
  const str = String(input || "").trim();
  if (!str) return "";
  if (str.startsWith("+")) {
    return `+${str
      .slice(1)
      .replace(/\D+/g, "")}`;
  }
  return str.replace(/\D+/g, "");
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

async function resolveVendor({ bid, job }) {
  const trimmedName = String(bid?.vendorName || job?.vendorName || "")
    .trim()
    .slice(0, 120);
  const normalizedPhone = normalizePhone(bid?.vendorPhone || job?.vendorPhone);

  let vendorDoc = null;

  if (job?.vendorId && mongoose.isValidObjectId(job.vendorId)) {
    vendorDoc = await Vendor.findById(job.vendorId);
  }

  if (!vendorDoc && mongoose.isValidObjectId(bid?.vendorId)) {
    vendorDoc = await Vendor.findById(bid.vendorId);
  }

  if (!vendorDoc && normalizedPhone) {
    vendorDoc = await Vendor.findOne({ phone: normalizedPhone });
  }

  if (!vendorDoc && trimmedName) {
    vendorDoc = await Vendor.findOne({ name: trimmedName });
  }

  if (!vendorDoc && normalizedPhone) {
    try {
      vendorDoc = await Vendor.create({
        name: trimmedName || "Vendor",
        phone: normalizedPhone,
        active: true,
        services: job?.serviceType ? [job.serviceType] : [],
        baseAddress: job?.pickupAddress || undefined,
      });
    } catch (creationError) {
      if (creationError?.code === 11000) {
        vendorDoc = await Vendor.findOne({ phone: normalizedPhone });
      } else {
        throw creationError;
      }
    }
  }

  if (vendorDoc) {
    let shouldSave = false;

    if (
      trimmedName &&
      trimmedName.length &&
      (!vendorDoc.name ||
        vendorDoc.name === vendorDoc.phone ||
        vendorDoc.name.toLowerCase().includes("vendor"))
    ) {
      vendorDoc.name = trimmedName;
      shouldSave = true;
    }

    if (
      normalizedPhone &&
      vendorDoc.phone &&
      vendorDoc.phone !== normalizedPhone
    ) {
      vendorDoc.phone = normalizedPhone;
      shouldSave = true;
    }

    if (!vendorDoc.phone && normalizedPhone) {
      vendorDoc.phone = normalizedPhone;
      shouldSave = true;
    }

    if (
      job?.serviceType &&
      !ensureArray(vendorDoc.services).includes(job.serviceType)
    ) {
      vendorDoc.services = [
        ...new Set([...ensureArray(vendorDoc.services), job.serviceType]),
      ];
      shouldSave = true;
    }

    if (job?.pickupAddress && !vendorDoc.baseAddress) {
      vendorDoc.baseAddress = job.pickupAddress;
      shouldSave = true;
    }

    if (shouldSave) {
      await vendorDoc.save();
    }
  }

  return { vendorDoc, normalizedPhone, trimmedName };
}

async function backfillJob(job, stats) {
  const bid =
    (job.selectedBidId && (await Bid.findById(job.selectedBidId))) || null;
  if (!bid) {
    stats.missingBid += 1;
    return;
  }

  const { vendorDoc, normalizedPhone, trimmedName } = await resolveVendor({
    bid,
    job,
  });

  const updates = {};
  let jobChanged = false;

  if (!job.vendorId && vendorDoc) {
    job.vendorId = vendorDoc._id;
    jobChanged = true;
    stats.jobsLinked += 1;
  }

  if (vendorDoc) {
    const vendorName = trimmedName || vendorDoc.name || job.vendorName;
    const vendorPhone = vendorDoc.phone || normalizedPhone || job.vendorPhone;

    if (vendorName && vendorName !== job.vendorName) {
      job.vendorName = vendorName;
      jobChanged = true;
    }
    if (vendorPhone && vendorPhone !== job.vendorPhone) {
      job.vendorPhone = vendorPhone;
      jobChanged = true;
    }
  } else if (normalizedPhone && normalizedPhone !== job.vendorPhone) {
    job.vendorPhone = normalizedPhone;
    jobChanged = true;
  }

  if (!job.assignedAt) {
    const fallbackTs =
      bid.createdAt ||
      job.updatedAt ||
      job.createdAt ||
      job.created ||
      new Date();
    job.assignedAt = fallbackTs;
    jobChanged = true;
    stats.assignedStamped += 1;
  }

  if (job.status !== "Assigned") {
    job.status = "Assigned";
    jobChanged = true;
  }

  if (jobChanged) {
    await job.save();
    stats.jobsUpdated += 1;
  }

  if (
    vendorDoc &&
    (!bid.vendorId || String(bid.vendorId) !== String(vendorDoc._id))
  ) {
    updates.bidVendorLinked += 1;
    await Bid.updateOne(
      { _id: bid._id },
      { $set: { vendorId: vendorDoc._id } }
    );
  }
}

async function run() {
  const stats = {
    scanned: 0,
    jobsUpdated: 0,
    jobsLinked: 0,
    assignedStamped: 0,
    bidVendorLinked: 0,
    missingBid: 0,
    errors: [],
  };

  await connectDB(process.env.MONGO_URI);

  const cursor = Job.find({
    selectedBidId: { $ne: null },
    $or: [
      { vendorId: { $exists: false } },
      { vendorId: null },
      { vendorName: { $in: [null, ""] } },
      { vendorPhone: { $in: [null, ""] } },
      { assignedAt: { $in: [null] } },
    ],
  })
    .sort({ createdAt: 1 })
    .cursor();

  for await (const job of cursor) {
    stats.scanned += 1;
    try {
      await backfillJob(job, stats);
    } catch (error) {
      console.error(`Failed to backfill job ${job._id}:`, error);
      stats.errors.push({ jobId: job._id, error: error.message });
    }
  }

  console.log("Backfill complete:", stats);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  mongoose.disconnect();
  process.exitCode = 1;
});
