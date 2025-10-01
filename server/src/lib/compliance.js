// server/src/lib/compliance.js
import Document from "../models/Document.js";
import Settings from "../models/Settings.js";

const DEFAULT_DRIVER_DOCS = ["license", "insurance"];
const DEFAULT_VENDOR_DOCS = ["license", "insurance", "business"];

const normalizeDocs = (value, fallback) => {
  if (Array.isArray(value) && value.length) {
    return value;
  }
  return fallback;
};

const lower = (value) => (value || "").toLowerCase();

export async function checkDriverCompliance(driverId) {
  const settings = await Settings.findOne().lean().exec();
  const workflow = settings?.workflow || {};

  const require = Boolean(
    workflow.requireDriverDocs ?? settings?.requireDriverDocs ?? false
  );
  const required = normalizeDocs(
    workflow.requiredDriverDocs ?? settings?.requiredDriverDocs,
    DEFAULT_DRIVER_DOCS
  );

  if (!require) {
    return { ok: true, reasons: [], required };
  }

  const docs = await Document.find({ ownerType: "driver", driverId })
    .lean()
    .exec();
  const now = Date.now();

  const reasons = [];
  required.forEach((type) => {
    const key = lower(type);
    const valid = docs.find(
      (doc) =>
        lower(doc.type) === key &&
        (!doc.expiresAt || new Date(doc.expiresAt).getTime() > now)
    );

    if (!valid) {
      const had = docs.find((doc) => lower(doc.type) === key);
      reasons.push(had ? `${type} expired/missing` : `${type} missing`);
    }
  });

  return { ok: reasons.length === 0, reasons, required };
}

export async function checkVendorCompliance(vendorId) {
  const settings = await Settings.findOne().lean().exec();
  const workflow = settings?.workflow || {};

  const require = Boolean(
    workflow.requireVendorDocs ?? settings?.requireVendorDocs ?? false
  );
  const required = normalizeDocs(
    workflow.requiredVendorDocs ?? settings?.requiredVendorDocs,
    DEFAULT_VENDOR_DOCS
  );

  if (!require) {
    return { ok: true, reasons: [], required };
  }

  const docs = await Document.find({ ownerType: "vendor", vendorId })
    .lean()
    .exec();
  const now = Date.now();

  const reasons = [];
  required.forEach((type) => {
    const key = lower(type);
    const valid = docs.find(
      (doc) =>
        lower(doc.type) === key &&
        (!doc.expiresAt || new Date(doc.expiresAt).getTime() > now)
    );

    if (!valid) {
      const had = docs.find((doc) => lower(doc.type) === key);
      reasons.push(had ? `${type} expired/missing` : `${type} missing`);
    }
  });

  return { ok: reasons.length === 0, reasons, required };
}

export async function complianceSummary({ ownerType, driverId, vendorId }) {
  const query = { ownerType };
  if (ownerType === "driver") query.driverId = driverId;
  if (ownerType === "vendor") query.vendorId = vendorId;

  const now = Date.now();
  const docs = await Document.find(query).lean();
  const approved = docs.filter((doc) => doc.status === "approved");
  const expired = approved.filter(
    (doc) => doc.expiresAt && new Date(doc.expiresAt).getTime() <= now
  );

  return {
    total: docs.length,
    approved: approved.length,
    expired: expired.length,
  };
}
