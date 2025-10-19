import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { fileURLToPath } from "url";
import Message from "../models/Message.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import { requireConversationAccess } from "../middleware/conversationAccess.js";
import { getIo } from "../realtime/index.js";
import { sendCustomerPushNotifications, sendVendorPushNotifications } from "../lib/push.js";
import { resolveClientBaseUrl } from "../lib/clientUrl.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.join(__dirname, "..", "uploads", "messages");

fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const extensionForMime = (mimetype = "") => {
  const [, subtypeRaw] = String(mimetype).toLowerCase().split("/");
  if (!subtypeRaw) return "";
  const subtype = subtypeRaw.split("+")[0];
  if (subtype === "jpeg") return ".jpg";
  if (subtype.includes("heic") || subtype.includes("heif")) return ".heic";
  if (subtype.includes("png")) return ".png";
  if (subtype.includes("gif")) return ".gif";
  if (subtype.includes("webp")) return ".webp";
  return `.${subtype.replace(/[^a-z0-9]/g, "")}`;
};

const buildAbsoluteUrl = (baseUrl, route) => {
  if (!route) return null;
  const base = (baseUrl || "").replace(/\/$/, "");
  return `${base}${route.startsWith("/") ? "" : "/"}${route}`;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext =
      path.extname(file.originalname)?.toLowerCase() ||
      extensionForMime(file.mimetype);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image uploads are allowed"));
    }
  },
});

const roomForJob = (jobId) => `messages/job/${jobId}`;

const sanitizeAttachment = (file) => ({
  key: file.key || file.filename || null,
  url: file.url,
  fileName: file.fileName || null,
  mimeType: file.mimeType || null,
  size: file.size ?? null,
});

const sanitizeMessage = (doc) => {
  if (!doc) return null;
  const src = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(src._id),
    jobId: String(src.jobId),
    senderRole: src.senderRole,
    senderId: src.senderId ? String(src.senderId) : null,
    senderName: src.senderName || null,
    body: src.body || "",
    attachments: Array.isArray(src.attachments)
      ? src.attachments.map(sanitizeAttachment)
      : [],
    readByCustomer: Boolean(src.readByCustomer),
    readByVendor: Boolean(src.readByVendor),
    createdAt: src.createdAt,
    updatedAt: src.updatedAt,
  };
};

const getParticipantSnapshot = async (context) => {
  const { job, isCustomer, isVendor, customerId, vendorId } = context;

  const [customerDoc, vendorDoc] = await Promise.all([
    customerId ? Customer.findById(customerId).select("name phone").lean() : null,
    vendorId ? Vendor.findById(vendorId).select("name phone company").lean() : null,
  ]);

  return {
    customer: customerDoc
      ? {
          id: customerDoc._id ? String(customerDoc._id) : customerId,
          name:
            customerDoc.name?.trim() ||
            job.customerName ||
            job.customerEmail ||
            "Customer",
          phone: customerDoc.phone || null,
          isSelf: isCustomer,
        }
      : null,
    vendor: vendorDoc
      ? {
          id: vendorDoc._id ? String(vendorDoc._id) : vendorId,
          name:
            vendorDoc.name?.trim() ||
            job.vendorName ||
            vendorDoc.company?.trim() ||
            "Vendor",
          phone: vendorDoc.phone || job.vendorPhone || null,
          isSelf: isVendor,
        }
      : job.vendorId
      ? {
          id: vendorId,
          name: job.vendorName || "Vendor",
          phone: job.vendorPhone || null,
          isSelf: isVendor,
        }
      : null,
  };
};

router.get(
  "/job/:jobId",
  requireConversationAccess,
  async (req, res, next) => {
    try {
      const { conversationContext } = req;
      const { actor, job } = conversationContext;

      const limitRaw = Number(req.query?.limit || 50);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(200, Math.max(1, limitRaw))
        : 50;

      const before = req.query?.before ? new Date(req.query.before) : null;
      const query = { jobId: job._id };
      if (before instanceof Date && !Number.isNaN(before.getTime())) {
        query.createdAt = { $lt: before };
      }

      const messages = await Message.find(query)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .lean();

      const participants = await getParticipantSnapshot(conversationContext);

      res.json({
        messages: messages.map(sanitizeMessage),
        canMessage:
          Boolean(conversationContext.vendorId) &&
          (conversationContext.isCustomer || conversationContext.isVendor),
        actor: {
          role: actor.role,
          id: actor.id,
        },
        participants,
        attachments: {
          maxFiles: 6,
          maxFileSizeBytes: 12 * 1024 * 1024,
          allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/job/:jobId",
  requireConversationAccess,
  upload.array("attachments", 6),
  async (req, res, next) => {
    const storedFiles = [];
    try {
      const { conversationContext } = req;
      const { job, actor, isCustomer, isVendor, vendorId } =
        conversationContext;

      if (!vendorId) {
        return res.status(409).json({
          message: "Messaging is available once a vendor is assigned.",
        });
      }

      const body =
        typeof req.body?.body === "string"
          ? req.body.body.trim().slice(0, 2000)
          : "";

      const files = Array.isArray(req.files) ? req.files : [];

      if (!body && files.length === 0) {
        return res.status(400).json({
          message: "Send a message or attach images of the vehicle.",
        });
      }

      const attachments = files.map((file) => {
        const key = file.filename;
        const relativeUrl = path.posix.join("uploads", "messages", key);
        const record = {
          key,
          url: `/${relativeUrl}`,
          fileName: file.originalname || null,
          mimeType: file.mimetype || null,
          size: file.size,
        };
        storedFiles.push(path.join(uploadRoot, key));
        return record;
      });

      let senderName = "Customer";
      if (isVendor) {
        const vendor =
          (await Vendor.findById(actor.id).select("name").lean()) || null;
        senderName =
          vendor?.name?.trim() ||
          job.vendorName ||
          job.vendorCity ||
          "Vendor";
      } else if (isCustomer) {
        const customer =
          (await Customer.findById(actor.id).select("name").lean()) || null;
        senderName =
          customer?.name?.trim() ||
          job.customerName ||
          job.customerEmail ||
          "Customer";
      }

      const messageDoc = await Message.create({
        jobId: job._id,
        senderRole: actor.role,
        senderId: actor.id,
        senderName,
        body,
        attachments,
        readByCustomer: isCustomer,
        readByVendor: isVendor,
      });

      const sanitized = sanitizeMessage(messageDoc);

      const baseUrl = resolveClientBaseUrl(req);
      const messagePreview = sanitized.body
        ? sanitized.body.slice(0, 140)
        : sanitized.attachments?.length
        ? "Sent an attachment"
        : "New message";

      if (isVendor && conversationContext.customerId) {
        const customerRoute = `/status/${job._id}`;
        await sendCustomerPushNotifications([
          {
            customerId: conversationContext.customerId,
            jobId: job._id,
            title: senderName ? `${senderName} sent a message` : "New message",
            body: messagePreview,
            severity: "info",
            meta: {
              role: "customer",
              jobId: job._id,
              kind: "message",
              route: customerRoute,
              absoluteUrl: buildAbsoluteUrl(baseUrl, customerRoute),
              dedupeKey: `customer:job:${job._id}:message:${sanitized.id}`,
            },
          },
        ]);
      }

      if (isCustomer && conversationContext.vendorId) {
        await sendVendorPushNotifications([
          {
            vendorId: conversationContext.vendorId,
            jobId: job._id,
            title: "Customer sent a message",
            body: messagePreview,
            severity: "info",
            meta: {
              role: "vendor",
              jobId: job._id,
              kind: "message",
              route: "/vendor/app",
              dedupeKey: `vendor:job:${job._id}:message:${sanitized.id}`,
            },
          },
        ]);
      }

      const io = getIo();
      if (io) {
        io.to(roomForJob(job._id)).emit("messages:new", sanitized);
      }

      res.status(201).json({ message: sanitized });
    } catch (error) {
      if (storedFiles.length) {
        await Promise.all(
          storedFiles.map((filePath) =>
            fsPromises.unlink(filePath).catch(() => {})
          )
        );
      }
      next(error);
    }
  }
);

router.post(
  "/job/:jobId/read",
  requireConversationAccess,
  async (req, res, next) => {
    try {
      const { conversationContext } = req;
      const { job, isCustomer, isVendor } = conversationContext;

      if (!isCustomer && !isVendor) {
        return res.status(403).json({ message: "Not allowed" });
      }

      const update = {};
      if (isCustomer) update.readByCustomer = true;
      if (isVendor) update.readByVendor = true;

      await Message.updateMany(
        {
          jobId: job._id,
          ...(isCustomer ? { senderRole: "vendor" } : {}),
          ...(isVendor ? { senderRole: "customer" } : {}),
        },
        { $set: update }
      );

      const io = getIo();
      if (io) {
        io.to(roomForJob(job._id)).emit("messages:read", {
          jobId: String(job._id),
          readerRole: isCustomer ? "customer" : "vendor",
        });
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
