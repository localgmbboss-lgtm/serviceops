import CommissionCharge from "../models/CommissionCharge.js";
import Vendor from "../models/Vendor.js";
import { roundCurrency } from "./commission.js";

export async function chargeVendorCommission({ job, vendorId, summary, reportedMethod }) {
  if (!job?._id) throw new Error("job document required");
  if (!vendorId) throw new Error("vendorId required");
  if (!summary) throw new Error("commission summary required");

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) {
    return {
      status: "failed",
      reason: "Vendor record missing",
    };
  }

  const now = new Date();
  const basePayload = {
    vendorId,
    reportedAmount: roundCurrency(summary.reportedAmount),
    commissionRate: summary.commissionRate,
    commissionAmount: roundCurrency(summary.commissionAmount),
  };

  const charge = await CommissionCharge.findOneAndUpdate(
    { jobId: job._id },
    {
      $set: basePayload,
      $setOnInsert: { status: "pending", requestedAt: now },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const billing = vendor.billing || {};
  if (!billing.customerId || !billing.defaultPaymentMethodId) {
    charge.status = "failed";
    charge.failureReason = "No payment method on file";
    charge.processedAt = now;
    charge.processor = billing.provider || "manual";
    await charge.save();

    job.commission.status = "failed";
    job.commission.failureReason = charge.failureReason;
    await job.save();

    return { status: "failed", reason: charge.failureReason };
  }

  // Simulate successful charge until real processor is wired
  charge.status = "succeeded";
  charge.processor = billing.provider || "manual";
  charge.processorReference = charge.processorReference || `SIM-${Date.now()}`;
  charge.processedAt = now;
  charge.failureReason = null;
  await charge.save();

  job.commission.status = "charged";
  job.commission.chargedAt = now;
  job.commission.chargeId = charge.processorReference;
  job.commission.failureReason = null;
  await job.save();

  return {
    status: "charged",
    transactionId: charge.processorReference,
    processor: charge.processor,
    processedAt: now,
    method: reportedMethod || null,
  };
}
