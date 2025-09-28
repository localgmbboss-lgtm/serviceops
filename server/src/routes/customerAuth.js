// server/routes/customerAuth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Customer from "../models/Customer.js";
import { notifySMS } from "../lib/notifier.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const OTP_EXP_MINUTES = Number(process.env.OTP_EXP_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_RESEND_SECONDS = Number(process.env.OTP_RESEND_SECONDS || 45);

const sign = (cust) =>
  jwt.sign({ sub: String(cust._id), role: "customer" }, JWT_SECRET, {
    expiresIn: "30d",
  });

const serializeCustomer = (cust) => {
  const profile = cust.savedProfile
    ? typeof cust.savedProfile.toObject === "function"
      ? cust.savedProfile.toObject()
      : { ...cust.savedProfile }
    : null;

  if (profile && !profile.updatedAt) {
    profile.updatedAt = cust.updatedAt || new Date();
  }

  return {
    _id: cust._id,
    name: cust.name || null,
    email: cust.email || null,
    phone: cust.phone || null,
    savedProfile: profile,
  };
};

const normalizeEmail = (s = "") => String(s).trim().toLowerCase();
const normalizePhone = (s = "") => {
  const t = String(s).trim();
  if (!t) return "";
  if (t.startsWith("+")) {
    return "+" + t.slice(1).replace(/\D+/g, "");
  }
  return t.replace(/\D+/g, "");
};

const toE164 = (normalized) => {
  if (!normalized) return "";
  if (normalized.startsWith("+")) return normalized;

  if (normalized.length === 10) {
    // Assume US/Canada when no country code is supplied
    return `+1${normalized}`;
  }

  if (normalized.length === 11 && normalized.startsWith("1")) {
    return `+${normalized}`;
  }

  return `+${normalized}`;
};

const authenticate = async (req) => {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("No token provided");
    err.status = 401;
    throw err;
  }

  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    const cust = await Customer.findById(payload.sub).exec();
    if (!cust) {
      const err = new Error("Customer not found");
      err.status = 404;
      throw err;
    }
    return cust;
  } catch (error) {
    const err = new Error("Invalid token");
    err.status = 401;
    throw err;
  }
};

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// ---------- OTP REQUEST ----------
router.post("/otp/request", async (req, res, next) => {
  try {
    const { phone } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }

    let customer = await Customer.findOne({ phone: normalizedPhone }).exec();
    if (!customer) {
      customer = await Customer.create({
        phone: normalizedPhone,
        isGuest: false,
      });
    }

    const now = Date.now();
    if (
      customer.otpLastSentAt &&
      now - customer.otpLastSentAt.getTime() < OTP_RESEND_SECONDS * 1000
    ) {
      const retryIn = Math.ceil(
        (OTP_RESEND_SECONDS * 1000 - (now - customer.otpLastSentAt.getTime())) /
          1000
      );
      return res.status(429).json({
        message: `Please wait ${retryIn}s before requesting another code`,
        retryIn,
      });
    }

    const code = generateOtp();
    customer.otpCodeHash = await bcrypt.hash(code, 10);
    customer.otpExpiresAt = new Date(now + OTP_EXP_MINUTES * 60 * 1000);
    customer.otpAttemptCount = 0;
    customer.otpLastSentAt = new Date(now);

    await customer.save();

    const msg = `ServiceOps login code: ${code}. It expires in ${OTP_EXP_MINUTES} minutes.`;
    const smsTarget = toE164(normalizedPhone);
    if (!smsTarget) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }

    await notifySMS(smsTarget, msg);

    return res.json({ ok: true, message: "OTP sent" });
  } catch (e) {
    next(e);
  }
});

// ---------- PHONE LOGIN (no OTP/password) ----------
router.post("/phone-login", async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const name = req.body?.name ? String(req.body.name).trim() : "";
    if (!phone) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }

    let customer = await Customer.findOne({ phone }).exec();
    if (!customer) {
      customer = await Customer.create({
        phone,
        name: name || undefined,
        isGuest: false,
      });
    } else if (name && !customer.name) {
      customer.name = name;
    }

    customer.lastLoginAt = new Date();
    await customer.save();

    return res.json({
      token: sign(customer),
      customer: serializeCustomer(customer),
    });
  } catch (e) {
    next(e);
  }
});
// ---------- OTP VERIFY ----------
router.post("/otp/verify", async (req, res, next) => {
  try {
    const { phone, code } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || !code) {
      return res.status(400).json({ message: "Phone and code are required" });
    }

    const customer = await Customer.findOne({ phone: normalizedPhone }).exec();
    if (!customer || !customer.otpCodeHash || !customer.otpExpiresAt) {
      return res.status(400).json({ message: "Request a new code" });
    }

    if (customer.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "Code expired. Request a new one" });
    }

    if (customer.otpAttemptCount >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        message: "Too many attempts. Request a new code",
      });
    }

    const match = await bcrypt.compare(String(code), customer.otpCodeHash);
    if (!match) {
      customer.otpAttemptCount += 1;
      await customer.save();
      return res.status(401).json({ message: "Invalid code" });
    }

    customer.otpCodeHash = undefined;
    customer.otpExpiresAt = undefined;
    customer.otpAttemptCount = 0;
    customer.otpLastSentAt = undefined;
    customer.lastLoginAt = new Date();
    if (!customer.name) {
      customer.name = customer.savedProfile?.name || "Customer";
    }
    await customer.save();

    return res.json({
      token: sign(customer),
      customer: serializeCustomer(customer),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- REGISTER ----------
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !password || (!email && !phone)) {
      return res
        .status(400)
        .json({ message: "Name, password and (email or phone) are required" });
    }

    const nEmail = normalizeEmail(email);
    const nPhone = normalizePhone(phone);

    const exists = await Customer.findOne({
      $or: [
        ...(nEmail ? [{ email: nEmail }] : []),
        ...(nPhone ? [{ phone: nPhone }] : []),
      ],
    }).lean();

    if (exists) {
      return res
        .status(409)
        .json({ message: "An account with that email/phone already exists" });
    }

    const passHash = await bcrypt.hash(String(password), 10);
    const cust = await Customer.create({
      name: String(name).trim(),
      email: nEmail || undefined,
      phone: nPhone || undefined,
      passHash,
    });

    return res.status(201).json({
      token: sign(cust),
      customer: serializeCustomer(cust),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- LOGIN ----------
router.post("/login", async (req, res, next) => {
  try {
    const { email, phone, password } = req.body || {};
    if (!password || (!email && !phone)) {
      return res
        .status(400)
        .json({ message: "Enter email or phone and password" });
    }

    const nEmail = normalizeEmail(email);
    const nPhone = normalizePhone(phone);

    const cust = await Customer.findOne(
      nEmail ? { email: nEmail } : { phone: nPhone }
    ).exec();

    if (!cust || !cust.passHash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(String(password), cust.passHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    cust.lastLoginAt = new Date();
    if (!cust.name) {
      cust.name = cust.savedProfile?.name || cust.name || "Customer";
    }
    await cust.save();

    return res.json({
      token: sign(cust),
      customer: serializeCustomer(cust),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- PROFILE SAVE ----------
router.put("/profile", async (req, res, next) => {
  try {
    const cust = await authenticate(req);
    const {
      name,
      email,
      phone,
      address,
      vehicleMake,
      vehicleModel,
      vehicleColor,
      vehiclePlate,
      notes,
    } = req.body || {};

    if (name) cust.name = String(name).trim();
    if (email) cust.email = normalizeEmail(email);
    if (phone) cust.phone = normalizePhone(phone);

    const existing = cust.savedProfile
      ? typeof cust.savedProfile.toObject === "function"
        ? cust.savedProfile.toObject()
        : { ...cust.savedProfile }
      : {};

    const nextProfile = {
      ...existing,
      ...(name ? { name: String(name).trim() } : {}),
      ...(email ? { email: normalizeEmail(email) } : {}),
      ...(phone ? { phone: normalizePhone(phone) } : {}),
      ...(address ? { address: String(address).trim() } : {}),
      ...(vehicleMake ? { vehicleMake: String(vehicleMake).trim() } : {}),
      ...(vehicleModel ? { vehicleModel: String(vehicleModel).trim() } : {}),
      ...(vehicleColor ? { vehicleColor: String(vehicleColor).trim() } : {}),
      ...(vehiclePlate ? { vehiclePlate: String(vehiclePlate).trim() } : {}),
      ...(notes ? { notes: String(notes).trim() } : {}),
      updatedAt: new Date(),
    };

    cust.savedProfile = nextProfile;
    await cust.save();

    return res.json({
      customer: serializeCustomer(cust),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- ME ----------
router.get("/me", async (req, res) => {
  try {
    const cust = await authenticate(req);
    res.json(serializeCustomer(cust));
  } catch (err) {
    res.status(err.status || 401).json({ message: err.message || "Invalid token" });
  }
});

export default router;

