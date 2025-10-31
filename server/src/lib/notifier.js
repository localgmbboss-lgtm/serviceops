import Outbox from "../models/Outbox.js";
import { logger } from "./logger.js";

const {
  TWILIO_SID,
  TWILIO_TOKEN,
  TWILIO_FROM,
  SMS_MAX_RETRIES = "3",
  SMS_TIMEOUT_MS = "4000",
  SMS_BREAKER_THRESHOLD = "5",
  SMS_BREAKER_COOLDOWN_MS = "60000",
} = process.env;

let twilioClient = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  const twilio = await import("twilio");
  twilioClient = twilio.default(TWILIO_SID, TWILIO_TOKEN);
}

const maxRetries = Math.max(0, Number(SMS_MAX_RETRIES) || 0);
const timeoutMs = Math.max(1000, Number(SMS_TIMEOUT_MS) || 4000);
const breakerThreshold = Math.max(1, Number(SMS_BREAKER_THRESHOLD) || 5);
const breakerCooldownMs = Math.max(
  10000,
  Number(SMS_BREAKER_COOLDOWN_MS) || 60000
);

let consecutiveFailures = 0;
let breakerOpenedAt = 0;

const isBreakerOpen = () => {
  if (!breakerOpenedAt) return false;
  const elapsed = Date.now() - breakerOpenedAt;
  if (elapsed > breakerCooldownMs) {
    breakerOpenedAt = 0;
    consecutiveFailures = 0;
    return false;
  }
  return true;
};

const recordFailure = () => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= breakerThreshold) {
    breakerOpenedAt = Date.now();
    logger.warn(
      {
        consecutiveFailures,
        breakerThreshold,
        breakerCooldownMs,
      },
      "SMS circuit breaker opened"
    );
  }
};

const recordSuccess = () => {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const withTimeout = (promise, ms, controller) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (controller) controller.abort?.();
      reject(new Error("SMS request timed out"));
    }, ms);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

async function sendSmsViaProvider({ to, body }) {
  if (!twilioClient || !TWILIO_FROM) {
    throw new Error("SMS provider not configured");
  }
  const controller = new AbortController();
  const request = twilioClient.messages.create({
    from: TWILIO_FROM,
    to,
    body,
  });
  await withTimeout(request, timeoutMs, controller);
}

async function queueOutbox({ to, body, jobId, status, error }) {
  const rec = await Outbox.create({
    kind: "sms",
    to,
    body,
    jobId,
    status,
    error,
  });
  return rec;
}

/**
 * Resilient SMS notifier with timeout, retry, and circuit breaker.
 */
export async function notifySMS(to, body, jobId = null) {
  if (!to || !body) throw new Error("Missing to/body");

  if (!twilioClient || !TWILIO_FROM || isBreakerOpen()) {
    logger.warn(
      { breakerOpen: isBreakerOpen(), to, jobId },
      "SMS provider unavailable, queuing message"
    );
    const rec = await queueOutbox({
      to,
      body,
      jobId,
      status: "queued",
      error: isBreakerOpen() ? "breaker_open" : "provider_not_configured",
    });
    return { ok: false, queuedId: rec._id };
  }

  let attempt = 0;
  const maxAttempts = Math.max(1, maxRetries + 1);
  while (attempt < maxAttempts) {
    try {
      await sendSmsViaProvider({ to, body });
      recordSuccess();
      return { ok: true };
    } catch (error) {
      attempt += 1;
      logger.warn(
        {
          attempt,
          maxAttempts,
          error: error.message,
          to,
        },
        "SMS send attempt failed"
      );
      if (attempt >= maxAttempts) {
        recordFailure();
        const rec = await queueOutbox({
          to,
          body,
          jobId,
          status: "failed",
          error: error.message,
        });
        return { ok: false, queuedId: rec._id };
      }
      await sleep(200 * attempt);
    }
  }

  // Fallback (should not reach)
  const rec = await queueOutbox({
    to,
    body,
    jobId,
    status: "failed",
    error: "unknown_failure",
  });
  return { ok: false, queuedId: rec._id };
}
