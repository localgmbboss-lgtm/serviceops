import Settings from "../models/Settings.js";

const DEFAULT_COMMISSION_CONFIG = Object.freeze({
  enabled: true,
  defaultRate: 0.3,
  tolerancePct: 0.15,
  toleranceAmount: 25,
  autoCharge: true,
});

export const roundCurrency = (value = 0) => {
  const num = Number(value) || 0;
  return Math.round(num * 100) / 100;
};

export async function getCommissionSettings() {
  const settings = await Settings.findOne().lean().exec();
  const cfg = settings?.commission || {};

  return {
    ...DEFAULT_COMMISSION_CONFIG,
    ...(typeof cfg === "object" ? cfg : {}),
  };
}

export function deriveExpectedRevenue(job) {
  if (!job) return 0;
  const values = [
    job.finalPrice,
    job.quotedPrice,
    job.expectedRevenue,
    job.serviceFee && job.serviceFee > 0 ? job.serviceFee / (job.commission?.rate || 1) : 0,
  ]
    .map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0))
    .filter((v) => v > 0);

  if (values.length === 0) return 0;
  return roundCurrency(Math.max(...values));
}

export function evaluateCommission(job, reportedAmount, options = {}) {
  const cfg = options.config || DEFAULT_COMMISSION_CONFIG;
  const reported = roundCurrency(Math.max(0, Number(reportedAmount) || 0));
  const rate = Math.min(Math.max(options.rate ?? cfg.defaultRate ?? DEFAULT_COMMISSION_CONFIG.defaultRate, 0), 1);
  const amount = roundCurrency(reported * rate);
  const expected = options.expectedRevenue != null
    ? roundCurrency(Math.max(0, options.expectedRevenue))
    : deriveExpectedRevenue(job);

  const shortfall = expected > 0 ? roundCurrency(expected - reported) : 0;
  const pctDrop = expected > 0 ? shortfall / expected : 0;
  const flagged =
    expected > 0 &&
    reported > 0 &&
    shortfall > 0 &&
    (shortfall >= (cfg.toleranceAmount ?? DEFAULT_COMMISSION_CONFIG.toleranceAmount) ||
      pctDrop >= (cfg.tolerancePct ?? DEFAULT_COMMISSION_CONFIG.tolerancePct));

  const flagReason = flagged
    ? `Reported ${reported.toFixed(2)} vs expected ${expected.toFixed(2)} (shortfall ${shortfall.toFixed(2)})`
    : null;

  return {
    reportedAmount: reported,
    commissionRate: rate,
    commissionAmount: amount,
    expectedRevenue: expected,
    shortfall,
    flagged,
    flagReason,
    shouldAutoCharge: Boolean(cfg.enabled && cfg.autoCharge && amount > 0),
  };
}

export function commissionSummary(job) {
  if (!job) return null;
  const cfg = job.commission || {};
  return {
    rate: cfg.rate || 0,
    amount: cfg.amount || 0,
    status: cfg.status || "pending",
    chargedAt: cfg.chargedAt || null,
    transaction: cfg.chargeId || null,
    failureReason: cfg.failureReason || null,
  };
}

export { DEFAULT_COMMISSION_CONFIG };
