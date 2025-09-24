// server/src/lib/compliance.js
import Document from "../models/Document.js";
import Settings from "../models/Settings.js";

/**
 * Returns { ok: boolean, reasons: string[], required: string[] }
 * Rules:
 *  - If Settings.requireDriverDocs is false => ok
 *  - Required doc types come from Settings.requiredDriverDocs or default ["license", "insurance"]
 *  - A driver is compliant if there is an unexpired doc for each required type
 */
export async function checkDriverCompliance(driverId) {
  const settings = await Settings.findOne().lean().exec();
  const require = !!settings?.requireDriverDocs;
  const required =
    Array.isArray(settings?.requiredDriverDocs) &&
    settings.requiredDriverDocs.length
      ? settings.requiredDriverDocs
      : ["license", "insurance"];
  if (!require) return { ok: true, reasons: [], required };

  const docs = await Document.find({ ownerType: "driver", driverId })
    .lean()
    .exec();
  const now = Date.now();

  const reasons = [];
  required.forEach((t) => {
    const found = docs.find(
      (d) =>
        (d.type || "").toLowerCase() === t.toLowerCase() &&
        (!d.expiresAt || new Date(d.expiresAt).getTime() > now)
    );
    if (!found) {
      const had = docs.find(
        (d) => (d.type || "").toLowerCase() === t.toLowerCase()
      );
      reasons.push(had ? `${t} expired/missing` : `${t} missing`);
    }
  });

  return { ok: reasons.length === 0, reasons, required };
}

/**
 * Returns { ok: boolean, reasons: string[], required: string[] }
 * Rules:
 *  - If Settings.requireVendorDocs is false => ok
 *  - Required doc types come from Settings.requiredVendorDocs or default ["license", "insurance", "business"]
 *  - A vendor is compliant if there is an unexpired doc for each required type
 */
export async function checkVendorCompliance(vendorId) {
  const settings = await Settings.findOne().lean().exec();
  const require = !!settings?.requireVendorDocs;
  const required =
    Array.isArray(settings?.requiredVendorDocs) &&
    settings.requiredVendorDocs.length
      ? settings.requiredVendorDocs
      : ["license", "insurance", "business"];
  if (!require) return { ok: true, reasons: [], required };

  const docs = await Document.find({ ownerType: "vendor", vendorId })
    .lean()
    .exec();
  const now = Date.now();

  const reasons = [];
  required.forEach((t) => {
    const found = docs.find(
      (d) =>
        (d.type || "").toLowerCase() === t.toLowerCase() &&
        (!d.expiresAt || new Date(d.expiresAt).getTime() > now)
    );
    if (!found) {
      const had = docs.find(
        (d) => (d.type || "").toLowerCase() === t.toLowerCase()
      );
      reasons.push(had ? `${t} expired/missing` : `${t} missing`);
    }
  });

  return { ok: reasons.length === 0, reasons, required };
}

export async function complianceSummary({ ownerType, driverId, vendorId }) {
  const q = { ownerType };
  if (ownerType === "driver") q.driverId = driverId;
  if (ownerType === "vendor") q.vendorId = vendorId;
  const now = Date.now();
  const docs = await Document.find(q).lean();
  const approved = docs.filter((d) => d.status === "approved");
  const expired = approved.filter(
    (d) => d.expiresAt && new Date(d.expiresAt).getTime() <= now
  );
  return {
    total: docs.length,
    approved: approved.length,
    expired: expired.length,
  };
}
