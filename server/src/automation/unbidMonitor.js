import Job from "../models/Jobs.js";
import Bid from "../models/Bid.js";
import AdminNotification from "../models/AdminNotification.js";
import { sendAdminPushNotifications } from "../lib/push.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_ALERT_MINUTES = 10;
const DEFAULT_BATCH_LIMIT = 25;

let timer = null;
let scanning = false;

const parseNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const shouldMonitor = () =>
  String(process.env.DISABLE_UNBID_ALERTS || "").toLowerCase() !== "true";

async function runScan() {
  if (scanning) return;
  scanning = true;

  try {
    const alertMinutes = parseNumber(
      process.env.UNBID_ALERT_MINUTES,
      DEFAULT_ALERT_MINUTES
    );
    const alertWindowMs = alertMinutes * 60 * 1000;
    const batchLimit = parseNumber(
      process.env.UNBID_ALERT_BATCH,
      DEFAULT_BATCH_LIMIT
    );
    const now = Date.now();
    const cutoff = now - alertWindowMs;

    const jobs = await Job.find({
      status: "Unassigned",
      cancelled: { $ne: true },
      unbidAlertSentAt: null,
    })
      .sort({ created: 1 })
      .limit(batchLimit)
      .lean();

    if (!jobs.length) return;

    for (const job of jobs) {
      try {
        if (job.vendorId) {
          continue;
        }
        if (job.bidMode !== "open" && job.biddingOpen !== true) {
          continue;
        }

        const createdAt = job.createdAt || job.created;
        const createdTime = createdAt ? new Date(createdAt).getTime() : null;
        if (!createdTime || createdTime > cutoff) {
          continue;
        }

        const bidCount = await Bid.countDocuments({ jobId: job._id });
        if (bidCount > 0) {
          continue;
        }

        const alertSentAt = new Date();
        const locked = await Job.findOneAndUpdate(
          { _id: job._id, unbidAlertSentAt: null },
          { $set: { unbidAlertSentAt: alertSentAt } },
          { new: false }
        );
        if (!locked) {
          continue;
        }

        const serviceLabel = job.serviceType || "Service request";
        const pickupLabel = job.pickupAddress || "Unknown location";

        const notification = await AdminNotification.create({
          title: "Job awaiting bids",
          body: `${serviceLabel} at ${pickupLabel} has no bids after ${alertMinutes} minutes.`,
          severity: "warning",
          jobId: job._id,
          customerId: job.customerId || null,
          meta: {
            role: "admin",
            kind: "job_unbid_alert",
            route: `/jobs/${job._id}`,
            jobId: job._id,
            alertMinutes,
            alertSentAt,
          },
        });

        await sendAdminPushNotifications([notification]);
      } catch (jobError) {
        console.error("[unbid-monitor] Failed to process job", job._id, jobError);
      }
    }
  } catch (error) {
    console.error("[unbid-monitor] Scan failed", error);
  } finally {
    scanning = false;
  }
}

export function startUnbidMonitor(options = {}) {
  if (timer || !shouldMonitor()) {
    return () => stopUnbidMonitor();
  }

  const intervalMs =
    options.intervalMs ??
    parseNumber(process.env.UNBID_MONITOR_INTERVAL_MS, DEFAULT_INTERVAL_MS);

  timer = setInterval(() => {
    runScan().catch((error) => {
      console.error("[unbid-monitor] Interval error", error);
    });
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  runScan().catch((error) => {
    console.error("[unbid-monitor] Initial scan error", error);
  });

  const alertMinutes = parseNumber(
    process.env.UNBID_ALERT_MINUTES,
    DEFAULT_ALERT_MINUTES
  );
  console.log(
    `[unbid-monitor] Started (interval ${Math.round(
      intervalMs / 1000
    )}s, alert ${alertMinutes}m)`
  );

  return () => stopUnbidMonitor();
}

export function stopUnbidMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
