import { getCommissionSettings, evaluateCommission } from "./commission.js";
import { chargeVendorCommission } from "./billing.js";

const sanitizeNote = (note) => {
  if (!note) return undefined;
  return String(note).trim().slice(0, 240) || undefined;
};

export async function completeJobWithPayment(job, {
  amount,
  method = null,
  note,
  actor = "vendor",
  autoCharge,
} = {}) {
  if (!job) throw new Error("job document required");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  const config = await getCommissionSettings();
  const summary = evaluateCommission(job, numericAmount, { config });
  const now = new Date();

  job.status = "Completed";
  job.completed = job.completed || now;
  job.paymentStatus = "paid";
  if (method) job.paymentMethod = method;
  job.paymentDate = now;

  job.reportedPayment = {
    amount: summary.reportedAmount,
    method: method || null,
    reportedAt: now,
    note: sanitizeNote(note),
    actor,
  };

  job.commission = {
    rate: summary.commissionRate,
    amount: summary.commissionAmount,
    status: summary.shouldAutoCharge ? "pending" : "skipped",
    chargedAt: null,
    chargeId: null,
    failureReason: null,
  };

  job.expectedRevenue = summary.expectedRevenue;
  job.flags = {
    underReport: summary.flagged,
    reason: summary.flagReason,
  };
  job.serviceFee = summary.commissionAmount;

  await job.save();

  let charge = null;
  const shouldCharge = autoCharge ?? summary.shouldAutoCharge;
  if (shouldCharge && job.vendorId) {
    charge = await chargeVendorCommission({
      job,
      vendorId: job.vendorId,
      summary,
      reportedMethod: method,
    });
  } else if (!shouldCharge && summary.shouldAutoCharge && job.commission.status !== "skipped") {
    job.commission.status = "skipped";
    job.commission.failureReason = null;
    await job.save();
  }

  return { summary, job, charge };
}
