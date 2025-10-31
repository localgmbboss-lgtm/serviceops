import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { fileURLToPath } from "url";
import Document from "../models/Document.js";
import { requireVendorAuth } from "./vendorAuth.js";
import {
  getVendorComplianceConfig,
  refreshVendorCompliance,
} from "../lib/compliance.js";
import { getWorkflowSettings } from "../lib/workflow.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.join(__dirname, "..", "uploads", "vendor-documents");
fs.mkdirSync(uploadRoot, { recursive: true });

const fileExtensionFromMime = (mimetype = "") => {
  const [, subtype] = String(mimetype).toLowerCase().split("/");
  if (!subtype) return "";
  if (subtype === "jpeg") return ".jpg";
  if (subtype.includes("pdf")) return ".pdf";
  return `.${subtype.replace(/[^a-z0-9]/g, "")}`;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safeExt =
      path.extname(file.originalname)?.toLowerCase() ||
      fileExtensionFromMime(file.mimetype) ||
      "";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const sanitizeDocument = (doc) => ({
  id: doc._id,
  requirementKey: doc.requirementKey,
  url: doc.url,
  status: doc.status,
  uploadedAt: doc.uploadedAt,
  title: doc.title,
});

router.post(
  "/",
  requireVendorAuth,
  upload.single("document"),
  async (req, res, next) => {
    try {
      const { requirementKey, documentNumber, notes = "", expiresAt } =
        req.body || {};

      if (!req.file) {
        return res.status(400).json({ message: "Attach a document file." });

      }


      const storedFilePath = path.join(uploadRoot, req.file.filename);

      const workflow = await getWorkflowSettings();
      if (workflow.requireVendorDocs === false) {
        await fsPromises.unlink(storedFilePath).catch(() => {});
        return res
          .status(403)
          .json({ message: "Vendor document uploads are disabled." });
      }

      if (!requirementKey) {
        await fsPromises.unlink(storedFilePath).catch(() => {});
        return res.status(400).json({ message: "Select the document type." });
      }

      if (!documentNumber || !String(documentNumber).trim()) {
        await fsPromises.unlink(storedFilePath).catch(() => {});
        return res
          .status(400)
          .json({ message: "Enter the document or certificate number." });
      }

      const config = await getVendorComplianceConfig();
      const requirement = config.documents.find(
        (doc) => doc.key === requirementKey || doc.kind === requirementKey
      );

      if (!requirement) {
        await fsPromises.unlink(storedFilePath).catch(() => {});
        return res.status(400).json({ message: "Unknown compliance requirement." });
      }

      const fileExt = path
        .extname(req.file.filename)
        .replace(".", "")
        .toLowerCase();
      const accepts = Array.isArray(requirement.accepts)
        ? requirement.accepts.map((ext) => String(ext).toLowerCase())
        : [];

      if (accepts.length && !accepts.includes(fileExt)) {
        await fsPromises.unlink(storedFilePath).catch(() => {});
        return res.status(400).json({ message: "Uploaded file type is not allowed for this requirement." });
      }

      let expiresAtDate = null;
      if (requirement.expires) {
        if (!expiresAt) {
          await fsPromises.unlink(storedFilePath).catch(() => {});
          return res
            .status(400)
            .json({ message: "Provide the expiration date for this document." });
        }
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) {
          await fsPromises.unlink(storedFilePath).catch(() => {});
          return res
            .status(400)
            .json({ message: "Enter a valid expiration date." });
        }
        expiresAtDate = parsed;
      } else if (expiresAt) {
        const parsed = new Date(expiresAt);
        if (!Number.isNaN(parsed.getTime())) {
          expiresAtDate = parsed;
        }
      }

      const relativeUrl = path.posix.join(
        "uploads",
        "vendor-documents",
        req.file.filename
      );

      const doc = await Document.create({
        ownerType: "vendor",
        vendorId: req.vendorId,
        title: requirement.label || req.file.originalname || "Vendor document",
        kind: requirement.kind || fileExt || req.file.mimetype || "document",
        requirementKey: requirement.key || requirementKey,
        url: `/${relativeUrl}`,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        status: "submitted",
        expiresAt: expiresAtDate,
        notes: String(notes).trim(),
        metadata: {
          submittedBy: "vendor",
          documentNumber: String(documentNumber).trim(),
          originalFilename: req.file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });

      await refreshVendorCompliance(req.vendorId);

      res.status(201).json({
        message: "Document uploaded for review.",
        document: sanitizeDocument(doc),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;



