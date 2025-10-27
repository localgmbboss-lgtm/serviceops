// server/src/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { connectDB } from "./lib/db.js";
import { initRealtime } from "./realtime/index.js";
import { configurePush } from "./lib/push.js";

import jobs from "./routes/jobs.js";
import customers from "./routes/customers.js";
import feedback from "./routes/feedback.js";
import reports from "./routes/reports.js";
import financials from "./routes/financials.js";
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
import vendorDocuments from "./routes/vendorDocuments.js";
import customerPush from "./routes/customerPush.js";
import messages from "./routes/messages.js";
import customerAuth from "./routes/customerAuth.js";
import adminAuth from "./routes/adminAuth.js";
import vendors from "./routes/vendors.js";
import pushRoutes from "./routes/push.js";
import ops from "./routes/ops.js";
import crm from "./routes/crm.js";
import knowledge from "./routes/knowledge.js";
import aiRouter from "./routes/ai.js";
import paymentRoutes from "./routes/payment.js";
import { startUnbidMonitor } from "./automation/unbidMonitor.js";

configurePush();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS configuration -----------------------------------------------------
const normalizeOrigin = (origin) => {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    const needsPort =
      url.port &&
      !(
        (url.protocol === "http:" && url.port === "80") ||
        (url.protocol === "https:" && url.port === "443")
      );
    return `${url.protocol}//${url.hostname}${needsPort ? `:${url.port}` : ""}`;
  } catch {
    return origin.replace(/\/$/, "");
  }
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://serviceops.pro",
  "https://www.serviceops.pro",
  "https://serviceops.onrender.com",
].map(normalizeOrigin);

const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => normalizeOrigin(s.trim()))
  .filter(Boolean);

const allowedOrigins = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...configuredOrigins,
]);

const allowAllOrigins = process.env.CORS_ALLOW_ALL === "true";

const corsOptions = {
  origin: (origin, cb) => {
    if (allowAllOrigins) return cb(null, true);

    const normalizedOrigin = normalizeOrigin(origin);

    if (!origin || allowedOrigins.has(normalizedOrigin)) return cb(null, true);

    const isDev =
      !process.env.NODE_ENV || process.env.NODE_ENV === "development";
    const isLocalhost =
      normalizedOrigin.startsWith("http://localhost") ||
      normalizedOrigin.startsWith("http://127.0.0.1");

    if (isDev && isLocalhost) return cb(null, true);

    return cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 200,
};

const prettyAllowedOrigins = [...allowedOrigins].filter(Boolean);
if (prettyAllowedOrigins.length) {
  console.log("CORS allowed origins:", prettyAllowedOrigins.join(", "));
} else {
  console.log("CORS allowed origins: (none)");
}

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    fallthrough: true,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/documents", documents);
app.use("/api/settings", settings);
app.use("/api/jobs", jobs);
app.use("/api/customers", customers);
app.use("/api/feedback", feedback);
app.use("/api/reports", reports);
app.use("/api/financials", financials);
app.use("/api/expenses", expenses);
app.use("/api/vendor/documents", vendorDocuments);
app.use("/api/vendor", vendorRouter);
app.use("/api/admin/auth", adminAuth);
app.use("/api/admin", admin);
app.use("/api/customer/push", customerPush);
app.use("/api/public", publicRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/bids", bids);
app.use("/api/outbox", outbox);
app.use("/api/vendor/auth", vendorAuth);
app.use("/api/vendor/feed", vendorFeed);
app.use("/api/vendor", vendorPortal);
app.use("/api/customer/auth", customerAuth);
app.use("/api/payments", paymentRoutes);
app.use("/api/messages", messages);
app.use("/api/vendors", vendors);
app.use("/api/ops", ops);
app.use("/api/crm", crm);
app.use("/api/knowledge", knowledge);
app.use("/api/ai", aiRouter);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Internal Server Error" });
});

(async () => {
  await connectDB(process.env.MONGO_URI);

  const realtime = initRealtime(httpServer, {
    allowedOrigins: [...allowedOrigins],
    allowAllOrigins,
  });
  app.locals.io = realtime;

  startUnbidMonitor();

  httpServer.listen(PORT, () => {
    const env = process.env.NODE_ENV || "development";
    console.log(`API listening on port ${PORT} (env: ${env})`);

    const externalUrl =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.PUBLIC_URL ||
      process.env.APP_BASE_URL;

    if (externalUrl) {
      console.log(`External URL: ${externalUrl}`);
    }
  });
})();










