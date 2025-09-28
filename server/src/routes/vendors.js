import { Router } from "express";
import Vendor from "../models/Vendor.js";

const router = Router();

const normalizePhone = (input = "") => {
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D+/g, "");
  }
  return trimmed.replace(/\D+/g, "");
};

const sanitizeSplit = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0.6;
  if (num > 1) return Math.min(num / 100, 0.95);
  return Math.min(num, 0.95);
};

const serializeVendor = (vendor) => {
  if (!vendor) return null;
  const v = vendor.toObject ? vendor.toObject() : vendor;
  return {
    _id: v._id,
    name: v.name,
    phone: v.phone || "",
    email: v.email || "",
    city: v.city || "",
    services: Array.isArray(v.services) ? v.services : [],
    heavyDuty: !!v.heavyDuty,
    earningsSplit: typeof v.earningsSplit === "number" ? v.earningsSplit : 0.6,
    active: v.active !== false,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
};

router.get("/", async (_req, res, next) => {
  try {
    const vendors = await Vendor.find({}).sort({ createdAt: -1 }).lean();
    res.json(vendors.map(serializeVendor));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, phone, city, earningsSplit } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ message: "name and phone are required" });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }

    const existing = await Vendor.findOne({ phone: normalizedPhone }).lean();
    if (existing) {
      return res.status(409).json({ message: "A vendor with that phone already exists" });
    }

    const vendor = await Vendor.create({
      name: String(name).trim(),
      phone: normalizedPhone,
      city: city ? String(city).trim() : undefined,
      earningsSplit: sanitizeSplit(earningsSplit),
      active: true,
    });

    res.status(201).json({ vendor: serializeVendor(vendor) });
  } catch (error) {
    next(error);
  }
});

export default router;
