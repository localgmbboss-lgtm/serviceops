import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
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
import { logger } from "./lib/logger.js";
import { metricsRegistry } from "./lib/metrics.js";

configurePush();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  logger.info(
    { origins: prettyAllowedOrigins },
    "CORS allowed origins configured"
  );
} else {
  logger.warn("CORS allowed origins: (none)");
}

const requestLogger = pinoHttp({
  logger,
  genReqId: (req) =>
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    randomUUID(),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    return "silent";
  },
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
  serializers: {
    err: pinoHttp.stdSerializers.err,
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

app.use(requestLogger);
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
app.get("/metrics", async (_req, res, next) => {
  try {
    res.set("Content-Type", metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  } catch (err) {
    next(err);
  }
});

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
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (req.log) {
    req.log.error({ err, status }, "Unhandled request error");
  } else {
    logger.error({ err, status }, "Unhandled request error");
  }
  res
    .status(status)
    .json({ message: err.message || "Internal Server Error" });
});

export { app, allowedOrigins, allowAllOrigins };
