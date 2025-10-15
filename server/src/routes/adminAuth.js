import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();
const JWT_SECRET =
  process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || "dev_admin_secret";
const SIGNUP_SECRET = process.env.ADMIN_SIGNUP_SECRET || "";
const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_DEFAULT_EMAIL || "admin@serviceops.dev").toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || "Admin#1234";

const sanitize = (user) => ({
  _id: user._id,
  email: user.email,
  role: user.role || "admin",
});

export function requireAdminAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing token" });
    const payload = jwt.verify(token, JWT_SECRET);
    req.adminId = payload.sub || payload.id || null;
    req.adminRole = payload.role || "admin";
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const emailLower = String(email).trim().toLowerCase();
    const attemptedDefault =
      emailLower === DEFAULT_ADMIN_EMAIL &&
      String(password) === DEFAULT_ADMIN_PASSWORD;

    let user = await User.findOne({ email: emailLower }).exec();

    if (!user && attemptedDefault) {
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
      user = await User.create({
        email: emailLower,
        passwordHash,
        role: "admin",
      });
    }

    if (!user)
      return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { sub: String(user._id), role: user.role || "admin" },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, secret } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const emailLower = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: emailLower }).lean();
    if (existing) {
      return res.status(409).json({ message: "User already exists" });
    }

    const adminCount = await User.countDocuments();
    const hasSecret = typeof secret === "string" && secret.trim().length > 0;
    if (adminCount > 0) {
      if (!SIGNUP_SECRET || !hasSecret || secret !== SIGNUP_SECRET) {
        return res.status(403).json({ message: "Registration requires admin invite" });
      }
    } else if (SIGNUP_SECRET && (!hasSecret || secret !== SIGNUP_SECRET)) {
      return res.status(403).json({ message: "Invalid registration secret" });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = await User.create({
      email: emailLower,
      passwordHash,
      role: "admin",
    });

    const token = jwt.sign(
      { sub: String(user._id), role: user.role || "admin" },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
});

export default router;

