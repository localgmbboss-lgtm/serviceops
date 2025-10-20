import mongoose from "mongoose";
import Job from "../models/Jobs.js";
import { decodeRequestActor } from "../lib/authTokens.js";

const isValidObjectId = (value) => {
  try {
    return mongoose.Types.ObjectId.isValid(value);
  } catch {
    return false;
  }
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
    const vendorId = job.vendorId ? String(job.vendorId) : null;

    const isCustomer = actor.role === "customer" && actor.id === customerId;
    const isVendor = actor.role === "vendor" && actor.id === vendorId;
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
