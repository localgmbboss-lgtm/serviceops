import { Router } from "express";
import mongoose from "mongoose";
import Document from "../models/Document.js";
import { refreshVendorCompliance } from "../lib/compliance.js";

const router = Router();

const isValidId = (value) => mongoose.isValidObjectId(value);

const sanitizeStatus = (value) => {
  if (!value) return undefined;
  const normalized = String(value).toLowerCase();
  return ["pending", "submitted", "verified", "rejected", "expired"].includes(
    normalized
  )
    ? normalized
    : undefined;
};

async function triggerCompliance({ ownerType, vendorId }) {
  if (ownerType === "vendor" && vendorId && isValidId(vendorId)) {
    try {
      await refreshVendorCompliance(vendorId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to refresh vendor compliance", error);
    }
  }
}

// GET /api/documents?ownerType=&driverId=&vendorId=&status=
router.get("/", async (req, res, next) => {
  try {
    const query = {};
    if (req.query.ownerType) query.ownerType = req.query.ownerType;
    if (req.query.status) query.status = req.query.status;
    if (req.query.driverId) {
      if (!isValidId(req.query.driverId)) {
        return res.status(400).json({ message: "Invalid driverId" });
      }
      query.driverId = req.query.driverId;
    }
    if (req.query.vendorId) {
      if (!isValidId(req.query.vendorId)) {
        return res.status(400).json({ message: "Invalid vendorId" });
      }
      query.vendorId = req.query.vendorId;
    }

    const list = await Document.find(query).sort({ uploadedAt: -1 }).lean();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

// POST /api/documents
router.post("/", async (req, res, next) => {
  try {
    const {
      ownerType,
      driverId,
      vendorId,
      title,
      kind,
      requirementKey,
      url,
      status,
      expiresAt,
      notes,
      mimeType,
      sizeBytes,
    } = req.body || {};

    if (!ownerType || !title || !kind || !url) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (ownerType === "driver" && driverId && !isValidId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    if (ownerType === "vendor" && vendorId && !isValidId(vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }

    const payload = {
      ownerType,
      driverId: ownerType === "driver" ? driverId || null : null,
      vendorId: ownerType === "vendor" ? vendorId || null : null,
      title,
      kind,
      requirementKey: requirementKey || null,
      url,
      status: sanitizeStatus(status) || "pending",
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes,
      mimeType: mimeType || "",
      sizeBytes: Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null,
    };

    const created = await Document.create(payload);
    await triggerCompliance({ ownerType, vendorId: payload.vendorId });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/documents/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const updates = {};
    [
      "title",
      "kind",
      "url",
      "requirementKey",
      "status",
      "expiresAt",
      "notes",
      "mimeType",
      "sizeBytes",
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        if (field === "status") {
          const normalized = sanitizeStatus(req.body[field]);
          if (normalized) updates.status = normalized;
          return;
        }
        if (field === "expiresAt") {
          updates.expiresAt = req.body[field]
            ? new Date(req.body[field])
            : null;
          return;
        }
        updates[field] = req.body[field];
      }
    });

    const doc = await Document.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await triggerCompliance({ ownerType: doc.ownerType, vendorId: doc.vendorId });

    res.json(doc);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await triggerCompliance({ ownerType: doc.ownerType, vendorId: doc.vendorId });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
