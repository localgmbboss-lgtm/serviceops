// server/routes/customerAuth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Customer from "../models/Customer.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const sign = (cust) =>
  jwt.sign({ sub: String(cust._id), role: "customer" }, JWT_SECRET, {
    expiresIn: "30d",
  });

const normalizeEmail = (s = "") => String(s).trim().toLowerCase();
const normalizePhone = (s = "") => {
  const t = String(s).trim();
  if (!t) return "";
  return t.startsWith("+")
    ? "+" + t.slice(1).replace(/\D+/g, "")
    : t.replace(/\D+/g, "");
};

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

    // Ensure uniqueness by either email or phone
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
      customer: {
        _id: cust._id,
        name: cust.name,
        email: cust.email || null,
        phone: cust.phone || null,
      },
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

    return res.json({
      token: sign(cust),
      customer: {
        _id: cust._id,
        name: cust.name,
        email: cust.email || null,
        phone: cust.phone || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------- ME ----------
router.get("/me", async (req, res) => {
  try {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ message: "No token" });

    const token = m[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const cust = await Customer.findById(payload.sub)
      .select("name email phone")
      .lean();
    if (!cust) return res.status(404).json({ message: "Customer not found" });

    res.json({
      _id: cust._id,
      name: cust.name,
      email: cust.email || null,
      phone: cust.phone || null,
    });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
