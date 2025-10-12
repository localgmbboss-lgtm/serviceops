// server/src/routes/vendorAuth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Vendor from "../models/Vendor.js";
import { refreshVendorCompliance } from "../lib/compliance.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ---- helpers ----
function signToken(vendorId) {
  return jwt.sign({ vid: String(vendorId) }, JWT_SECRET, { expiresIn: "30d" });
}

function normalizePhone(input = "") {
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D+/g, "");
  return trimmed.replace(/\D+/g, "");
}

function sanitizeVendor(v) {
  if (!v) return null;
  return {
    _id: v._id,
    name: v.name,
    phone: v.phone || null,
    email: v.email || null,
    city: v.city || null,
    services: Array.isArray(v.services) ? v.services : [],
    heavyDuty: !!v.heavyDuty,
    radiusKm: typeof v.radiusKm === "number" ? v.radiusKm : 25,
    baseAddress: v.baseAddress || null,
    lat: typeof v.lat === "number" ? v.lat : null,
    lng: typeof v.lng === "number" ? v.lng : null,
    active: v.active !== false,
    complianceStatus: v.complianceStatus || "pending",
    compliance: v.compliance || {
      enforcement: "submission",
      allowed: false,
      missing: [],
      requirements: [],
      lastCheckedAt: null,
    },
  };
}

export function requireVendorAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const tok = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!tok) return res.status(401).json({ message: "Missing token" });
    const payload = jwt.verify(tok, JWT_SECRET);
    req.vendorId = payload.vid;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

// ---- POST /api/vendor/auth/register ----
// Accepts: name, phone?, email?, city?, password, services?, heavyDuty?, radiusKm?, lat?, lng?
router.post("/register", async (req, res, next) => {
  try {
    let {
      name,
      phone,
      email,
      city,
      password,
      services,
      heavyDuty,
      radiusKm,
      lat,
      lng,
      baseAddress,
    } = req.body || {};

    name = String(name || "").trim();
    phone = normalizePhone(phone);
    email = email ? String(email).trim().toLowerCase() : undefined;
    city = city ? String(city).trim() : undefined;
    baseAddress = baseAddress ? String(baseAddress).trim() : undefined;

    if (!name || !password || (!phone && !email)) {
      return res
        .status(400)
        .json({ message: "name, password and (phone or email) are required" });
    }
    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // Avoid dupes on either field (model has unique+sparse, but check proactively for a nicer error)
    const dupe = await Vendor.findOne({
      $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    }).lean();
    if (dupe) {
      return res.status(409).json({ message: "Phone or email already exists" });
    }

    const passHash = await bcrypt.hash(String(password), 10);

    const v = await Vendor.create({
      name,
      phone: phone || undefined,
      email,
      city,
      baseAddress,
      passHash,
      services: Array.isArray(services) ? services.map(String) : [],
      heavyDuty: !!heavyDuty,
      radiusKm: Number.isFinite(Number(radiusKm)) ? Number(radiusKm) : 25,
      lat: Number.isFinite(Number(lat)) ? Number(lat) : undefined,
      lng: Number.isFinite(Number(lng)) ? Number(lng) : undefined,
      active: true,
      complianceStatus: "pending",
    });

    await refreshVendorCompliance(v._id);

    const token = signToken(v._id);
    res.status(201).json({ token, vendor: sanitizeVendor(v) });
  } catch (e) {
    // Handle unique index collisions from Mongo as well
    if (e?.code === 11000) {
      return res.status(409).json({ message: "Phone or email already exists" });
    }
    next(e);
  }
});

// ---- POST /api/vendor/auth/login ----
// Accepts: phone+password OR email+password
router.post("/login", async (req, res, next) => {
  try {
    const { phone, email, password } = req.body || {};
    const hasPhone = !!(phone && String(phone).trim());
    const hasEmail = !!(email && String(email).trim());

    if (!hasPhone && !hasEmail) {
      return res.status(400).json({ message: "Provide phone or email" });
    }
    const find = hasPhone
      ? { phone: String(phone).trim() }
      : { email: String(email).trim().toLowerCase() };

    const v = await Vendor.findOne(find).exec();
    if (!v || !v.passHash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(String(password || ""), v.passHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(v._id);
    res.json({ token, vendor: sanitizeVendor(v) });
  } catch (e) {
    next(e);
  }
});

// ---- POST /api/vendor/auth/phone-login ----
// Accepts: phone only; creates login session without password.
router.post("/phone-login", async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }

    const vendor = await Vendor.findOne({ phone }).exec();
    if (!vendor) {
      return res
        .status(404)
        .json({
          message:
            "We couldn't find a vendor with that number. Please contact support to get set up.",
        });
    }

    vendor.lastLoginAt = new Date();
    await vendor.save();

    const token = signToken(vendor._id);
    res.json({ token, vendor: sanitizeVendor(vendor) });
  } catch (e) {
    next(e);
  }
});

// ---- GET /api/vendor/auth/me ----
// Use this on VendorApp load to restore the session
router.get("/me", requireVendorAuth, async (req, res, next) => {
  try {
    const v = await Vendor.findById(req.vendorId).lean();
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    res.json({ vendor: sanitizeVendor(v) });
  } catch (e) {
    next(e);
  }
});

// ---- PATCH /api/vendor/auth/profile ----
// Allow vendor to update basic profile bits from their dashboard
router.patch("/profile", requireVendorAuth, async (req, res, next) => {
  try {
    const v = await Vendor.findById(req.vendorId);
    if (!v) return res.status(404).json({ message: "Vendor not found" });

    const { name, city, services, heavyDuty, radiusKm, lat, lng, active, baseAddress } =
      req.body || {};

    if (typeof name === "string") v.name = name.trim();
    if (typeof city === "string") v.city = city.trim();
    if (typeof baseAddress === "string") v.baseAddress = baseAddress.trim();
    if (Array.isArray(services)) v.services = services.map(String);
    if (typeof heavyDuty === "boolean") v.heavyDuty = heavyDuty;
    if (Number.isFinite(Number(radiusKm))) v.radiusKm = Number(radiusKm);
    if (Number.isFinite(Number(lat))) v.lat = Number(lat);
    if (Number.isFinite(Number(lng))) v.lng = Number(lng);
    if (typeof active === "boolean") v.active = active;

    await v.save();
    res.json({ vendor: sanitizeVendor(v) });
  } catch (e) {
    next(e);
  }
});

export default router;


