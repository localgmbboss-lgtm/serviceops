import Document from "../models/Document.js";
import Settings from "../models/Settings.js";
import Vendor from "../models/Vendor.js";

const DEFAULT_VENDOR_DOCS = [
  {
    key: "government_id",
    label: "Government-issued ID",
    description: "Valid driver license or state-issued identification card for the primary operator.",
    kind: "identity",
    required: true,
    accepts: ["pdf", "jpg", "jpeg", "png"],
    expires: true,
    validityDays: 365,
  },
  {
    key: "vehicle_registration",
    label: "Vehicle Registration",
    description: "Registration document for the primary service vehicle.",
    kind: "registration",
    required: true,
    accepts: ["pdf", "jpg", "jpeg", "png"],
    expires: true,
    validityDays: 365,
  },
  {
    key: "insurance_certificate",
    label: "Proof of Insurance",
    description: "Certificate of insurance showing active coverage for roadside operations.",
    kind: "insurance",
    required: true,
    accepts: ["pdf", "jpg", "jpeg", "png"],
    expires: true,
    validityDays: 180,
  },
  {
    key: "tax_w9",
    label: "W-9 Tax Form",
    description: "Completed IRS W-9 for payout compliance.",
    kind: "tax",
    required: true,
    accepts: ["pdf"],
    expires: false,
    validityDays: null,
  },
];

const SUBMISSION_STATUSES = new Set(["pending", "submitted", "verified"]);
const VERIFIED_STATUSES = new Set(["verified"]);

const normalizeArray = (value, fallback) => {
  if (Array.isArray(value) && value.length) {
    return value;
  }
  if (typeof fallback === "function") {
    return fallback();
  }
  return fallback || [];
};

const resolveVendorComplianceConfig = (settingsDoc) => {
  const raw = settingsDoc?.compliance?.vendor || {};
  return {
    enforce: raw.enforce || "submission",
    autoSuspendOnExpiry: raw.autoSuspendOnExpiry !== false,
    documents: normalizeArray(raw.documents, DEFAULT_VENDOR_DOCS).map((doc) => ({
      ...doc,
      key: doc.key || doc.kind,
      accepts: Array.isArray(doc.accepts) && doc.accepts.length
        ? doc.accepts
        : ["pdf", "jpg", "jpeg", "png"],
      required: doc.required !== false,
      expires: doc.expires === true,
      validityDays: doc.validityDays ?? null,
    })),
  };
};

export async function getVendorComplianceConfig() {
  const settings = await Settings.findOne().lean();
  return resolveVendorComplianceConfig(settings || {});
}

export function computeDocumentStatus({ doc, enforcement, autoSuspendOnExpiry }) {
  if (!doc) {
    return {
      uploaded: false,
      valid: false,
      reason: "missing",
    };
  }
  const status = (doc.status || "pending").toLowerCase();
  const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : null;
  const now = Date.now();
  const isExpired = Boolean(expiresAt && expiresAt <= now);

  if (isExpired) {
    return {
      uploaded: true,
      valid: !autoSuspendOnExpiry,
      reason: "expired",
    };
  }

  if (enforcement === "verified") {
    return {
      uploaded: true,
      valid: VERIFIED_STATUSES.has(status),
      reason: VERIFIED_STATUSES.has(status) ? null : "pending_verification",
    };
  }

  // submission enforcement
  return {
    uploaded: true,
    valid: SUBMISSION_STATUSES.has(status),
    reason: SUBMISSION_STATUSES.has(status) ? null : "rejected",
  };
}

export async function evaluateVendorCompliance(vendorId, options = {}) {
  const [settings, docs] = await Promise.all([
    Settings.findOne().lean(),
    Document.find({ ownerType: "vendor", vendorId }).lean(),
  ]);

  const config = resolveVendorComplianceConfig(settings || {});
  const enforcement = options.enforce ?? config.enforce ?? "submission";
  const autoSuspendOnExpiry =
    options.autoSuspendOnExpiry ?? config.autoSuspendOnExpiry ?? true;
  const requirements = config.documents.filter((req) => req.required !== false);

  const now = Date.now();
  const results = requirements.map((req) => {
    const matches = docs.filter((doc) => {
      if (doc.requirementKey && req.key) {
        return doc.requirementKey === req.key;
      }
      return (doc.kind || "").toLowerCase() === (req.kind || "").toLowerCase();
    });

    const activeDoc = matches.find((doc) => {
      if (!doc) return false;
      if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= now) {
        return false;
      }
      if (enforcement === "verified") {
        return VERIFIED_STATUSES.has((doc.status || "").toLowerCase());
      }
      return SUBMISSION_STATUSES.has((doc.status || "").toLowerCase());
    }) || matches[0] || null;

    const status = computeDocumentStatus({
      doc: activeDoc,
      enforcement,
      autoSuspendOnExpiry,
    });

    return {
      requirement: req,
      document: activeDoc,
      status,
    };
  });

  const missing = results
    .filter((r) => !r.status.valid)
    .map((r) => ({
      key: r.requirement.key,
      label: r.requirement.label,
      reason: r.status.reason || "missing",
    }));

  const allowed = enforcement === "off" || missing.length === 0;
  const status = allowed ? "compliant" : "non_compliant";

  return {
    allowed,
    status,
    enforcement,
    missing,
    requirements: results.map((r) => ({
      key: r.requirement.key,
      label: r.requirement.label,
      description: r.requirement.description || "",
      accepts: r.requirement.accepts,
      expires: r.requirement.expires,
      validityDays: r.requirement.validityDays,
      status: {
        uploaded: r.status.uploaded,
        valid: r.status.valid,
        reason: r.status.reason,
      },
      document: r.document
        ? {
            _id: r.document._id,
            status: r.document.status,
            url: r.document.url,
            expiresAt: r.document.expiresAt,
            uploadedAt: r.document.uploadedAt,
          }
        : null,
    })),
  };
}

export async function refreshVendorCompliance(vendorId, options = {}) {
  const evaluation = await evaluateVendorCompliance(vendorId, options);
  await Vendor.findByIdAndUpdate(
    vendorId,
    {
      complianceStatus: evaluation.status,
      compliance: {
        lastCheckedAt: new Date(),
        enforcement: evaluation.enforcement,
        allowed: evaluation.allowed,
        missing: evaluation.missing,
        requirements: evaluation.requirements,
      },
    },
    { new: false }
  );
  return evaluation;
}

export async function complianceSummary({ ownerType, vendorId, driverId }) {
  const query = { ownerType };
  if (ownerType === "vendor" && vendorId) query.vendorId = vendorId;
  if (ownerType === "driver" && driverId) query.driverId = driverId;

  const docs = await Document.find(query).lean();
  const now = Date.now();

  const totals = {
    total: docs.length,
    submitted: 0,
    verified: 0,
    expired: 0,
    rejected: 0,
  };

  docs.forEach((doc) => {
    const status = (doc.status || "pending").toLowerCase();
    if (status === "verified") totals.verified += 1;
    if (status === "submitted" || status === "pending") totals.submitted += 1;
    if (status === "rejected") totals.rejected += 1;
    if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= now) {
      totals.expired += 1;
    }
  });

  return { ...totals, approved: totals.verified };
}
