import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import Vendor from "../models/Vendor.js";
import { decodeRequestActor } from "../lib/authTokens.js";

const isValidObjectId = (value) => {
  try {
    return mongoose.Types.ObjectId.isValid(value);
  } catch {
    return false;
  }
};

const normalizePhone = (input) => {
  if (!input) return "";
  const str = String(input).trim();
  if (!str) return "";
  if (str.startsWith("+")) {
    return `+${str.slice(1).replace(/\D+/g, "")}`;
  }
  return str.replace(/\D+/g, "");
};

export async function requireConversationAccess(req, res, next) {
  try {
    const actor = decodeRequestActor(req);
    const jobId = req.params?.jobId || req.params?.id || req.body?.jobId;

    if (!jobId || !isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job id" });
    }

    const job = await Job.findById(jobId)
      .select(
        "_id customerId vendorId status vendorName vendorPhone vendorCity vendorRegion"
      )
      .lean();

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const customerId = job.customerId ? String(job.customerId) : null;
    let vendorId = job.vendorId ? String(job.vendorId) : null;
    const jobVendorPhone = normalizePhone(job.vendorPhone);
    const isCustomer = actor.role === "customer" && actor.id === customerId;
    let isVendor = actor.role === "vendor" && actor.id === vendorId;
    if (actor.role === "vendor" && !isVendor && jobVendorPhone) {
      try {
        const vendorDoc = actor.id
          ? await Vendor.findById(actor.id).select("_id phone").lean()
          : null;
        const vendorPhone = normalizePhone(vendorDoc?.phone);
        if (vendorPhone && vendorPhone === jobVendorPhone) {
          isVendor = true;
          if (!vendorId && vendorDoc?._id) {
            vendorId = String(vendorDoc._id);
          }
        }
      } catch {
        // ignore lookup errors and fall back to strict id match
      }
    }
    const isAdmin = actor.role === "admin";

    if (!isCustomer && !isVendor && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    req.conversationContext = {
      job,
      actor,
      isCustomer,
      isVendor,
      isAdmin,
      customerId,
      vendorId,
    };
    next();
  } catch (error) {
    const status = error.status || 500;
    res
      .status(status)
      .json({ message: error.message || "Unable to authenticate request" });
  }
}
