// server/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./lib/db.js";

import drivers from "./routes/drivers.js";
import jobs from "./routes/jobs.js";
import customers from "./routes/customers.js";
import feedback from "./routes/feedback.js";
import reports from "./routes/reports.js";
import documents from "./routes/documents.js";
import settings from "./routes/settings.js";
import expenses from "./routes/expenses.js";
import vendorRouter from "./routes/vendor.js";
import admin from "./routes/admin.js";
import publicRoutes from "./routes/public.js";
import exportRoutes from "./routes/exports.js";
import bids from "./routes/bids.js";
import outbox from "./routes/outbox.js";
import vendorAuth from "./routes/vendorAuth.js";
import vendorFeed from "./routes/vendorFeed.js";
import vendorPortal from "./routes/vendorPortal.js";
import customerAuth from "./routes/customerAuth.js";
import adminAuth from "./routes/adminAuth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Allow multiple origins (CSV) + no-origin (Thunder/CLI)
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://www.localgmbboss.com",
  "https://localgmbboss.com",
];

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED = Array.from(
  new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins])
);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};

app.use(cors(corsOptions));
// ✅ Express 5: use a RegExp, not "*"
app.options(/.*/, cors(corsOptions));

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/documents", documents);
app.use("/api/settings", settings);
app.use("/api/drivers", drivers);
app.use("/api/jobs", jobs);
app.use("/api/customers", customers);
app.use("/api/feedback", feedback);
app.use("/api/reports", reports);
app.use("/api/expenses", expenses);
app.use("/api/vendor", vendorRouter);
app.use("/api/admin/auth", adminAuth);
app.use("/api/admin", admin);
app.use("/api/public", publicRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/bids", bids);
app.use("/api/outbox", outbox);
app.use("/api/vendor/auth", vendorAuth);
app.use("/api/vendor/feed", vendorFeed);
app.use("/api/vendor", vendorPortal);
app.use("/api/customer/auth", customerAuth);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Internal Server Error" });
});

(async () => {
  await connectDB(process.env.MONGO_URI);
  app.listen(PORT, () =>
    console.log(`🚀 API listening on http://localhost:${PORT}`)
  );
})();



