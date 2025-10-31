import webPush from "web-push";
import PushSubscription from "../models/PushSubscription.js";
import { logger } from "./logger.js";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const CONTACT =
  process.env.VAPID_CONTACT || "mailto:localgmboss@gmail.com";

let configured = false;

export function configurePush() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.warn(
      "Web push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured."
    );
    configured = false;
    return configured;
  }

  try {
    webPush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
    console.log("Web push notifications enabled.");
  } catch (error) {
    configured = false;
    console.error("Failed to configure web push:", error);
  }
  return configured;
}

export function isPushConfigured() {
  return configured;
}

export function getVapidPublicKey() {
  return configured ? PUBLIC_KEY : "";
}

function normalizeSubscription(raw) {
  if (!raw) return null;
  return typeof raw.toJSON === "function" ? raw.toJSON() : raw;
}

async function upsertSubscription({
  role,
  vendorId = null,
  userId = null,
  customerId = null,
  subscription,
  meta = {},
}) {
  if (!configured) {
    throw new Error("Push messaging not configured.");
  }
  if (!subscription?.endpoint) {
    throw new Error("Invalid subscription payload.");
  }

  const normalized = normalizeSubscription(subscription);
  const userAgent = meta?.userAgent || "";
  const platform = meta?.platform || "";
  const source = meta?.source || "";
  const appBaseUrl = meta?.appBaseUrl || "";

  const update = {
    role,
    subscription: normalized,
    userAgent,
    platform,
    source,
    appBaseUrl,
    status: "active",
    failCount: 0,
    lastError: "",
    lastUsedAt: new Date(),
  };

  if (role === "vendor") {
    update.vendorId = vendorId;
    update.userId = null;
    update.customerId = null;
  } else if (role === "admin") {
    update.userId = userId;
    update.vendorId = null;
    update.customerId = null;
  } else if (role === "customer") {
    update.customerId = customerId;
    update.vendorId = null;
    update.userId = null;
  }

  const doc = await PushSubscription.findOneAndUpdate(
    { "subscription.endpoint": normalized.endpoint },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

export async function registerVendorSubscription(vendorId, payload = {}) {
  return upsertSubscription({
    role: "vendor",
    vendorId,
    subscription: payload.subscription,
    meta: payload.meta || payload,
  });
}

export async function registerAdminSubscription(userId, payload = {}) {
  return upsertSubscription({
    role: "admin",
    userId,
    subscription: payload.subscription,
    meta: payload.meta || payload,
  });
}

export async function registerCustomerSubscription(customerId, payload = {}) {
  return upsertSubscription({
    role: "customer",
    customerId,
    subscription: payload.subscription,
    meta: payload.meta || payload,
  });
}

export async function unregisterSubscription(endpoint) {
  if (!endpoint) return;
  try {
    await PushSubscription.deleteOne({ "subscription.endpoint": endpoint });
  } catch (error) {
    console.error("Failed to unregister push subscription:", error);
  }
}

function toPayload(notification, { type, defaultRoute, defaultBaseUrl }) {
  const meta = notification.meta || {};
  const route = meta.route || defaultRoute || "/";
  const appBase = meta.appBaseUrl || defaultBaseUrl || "";
  const absoluteUrl =
    meta.absoluteUrl ||
    (appBase ? `${appBase}${route.startsWith("/") ? "" : "/"}${route}` : null);

  return {
    type,
    title: notification.title || "ServiceOps",
    body: notification.body || "",
    meta: {
      ...meta,
      route,
      absoluteUrl,
      notificationId: notification._id,
    },
    createdAt: notification.createdAt,
    jobId: notification.jobId,
    customerId: notification.customerId,
    url: absoluteUrl || route,
  };
}

const {
  PUSH_MAX_RETRIES = "2",
  PUSH_TIMEOUT_MS = "4000",
  PUSH_BREAKER_THRESHOLD = "5",
  PUSH_BREAKER_COOLDOWN_MS = "60000",
} = process.env;

const pushMaxRetries = Math.max(0, Number(PUSH_MAX_RETRIES) || 0);
const pushTimeoutMs = Math.max(1000, Number(PUSH_TIMEOUT_MS) || 4000);
const pushBreakerThreshold = Math.max(1, Number(PUSH_BREAKER_THRESHOLD) || 5);
const pushBreakerCooldownMs = Math.max(
  10000,
  Number(PUSH_BREAKER_COOLDOWN_MS) || 60000
);

let pushConsecutiveFailures = 0;
let pushBreakerOpenedAt = 0;

const isPushBreakerOpen = () => {
  if (!pushBreakerOpenedAt) return false;
  const elapsed = Date.now() - pushBreakerOpenedAt;
  if (elapsed > pushBreakerCooldownMs) {
    pushBreakerOpenedAt = 0;
    pushConsecutiveFailures = 0;
    return false;
  }
  return true;
};

const recordPushFailure = () => {
  pushConsecutiveFailures += 1;
  if (pushConsecutiveFailures >= pushBreakerThreshold) {
    pushBreakerOpenedAt = Date.now();
    logger.warn(
      {
        pushConsecutiveFailures,
        pushBreakerThreshold,
        pushBreakerCooldownMs,
      },
      "Push circuit breaker opened"
    );
  }
};

const recordPushSuccess = () => {
  pushConsecutiveFailures = 0;
  pushBreakerOpenedAt = 0;
};

const pushSleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const withPushTimeout = (promise, ms, subId) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Push request timed out"));
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

async function sendNotificationWithResilience(sub, payload) {
  if (isPushBreakerOpen()) {
    throw new Error("Push circuit breaker open");
  }

  let attempt = 0;
  const maxAttempts = Math.max(1, pushMaxRetries + 1);
  while (attempt < maxAttempts) {
    try {
      await withPushTimeout(
        webPush.sendNotification(sub.subscription, payload),
        pushTimeoutMs
      );
      await PushSubscription.updateOne(
        { _id: sub._id },
        {
          $set: {
            lastUsedAt: new Date(),
            failCount: 0,
            lastError: "",
          },
        }
      );
      recordPushSuccess();
      return;
    } catch (error) {
      attempt += 1;
      logger.warn(
        {
          attempt,
          maxAttempts,
          subId: sub._id,
          error: error?.message,
        },
        "Push send attempt failed"
      );
      const status = error?.statusCode;
      const body = error?.body || "";
      const isGone = status === 404 || status === 410;
      if (isGone) {
        await PushSubscription.deleteOne({ _id: sub._id });
        recordPushSuccess();
        return;
      }

      if (attempt >= maxAttempts) {
        await PushSubscription.updateOne(
          { _id: sub._id },
          {
            $inc: { failCount: 1 },
            $set: {
              lastError: body || error?.message || "push send failed",
            },
          }
        );
        recordPushFailure();
        throw error;
      }

      await pushSleep(200 * attempt);
    }
  }
}

async function dispatchNotifications(subs, payload) {
  if (!subs.length) return;

  if (isPushBreakerOpen()) {
    logger.warn(
      { subCount: subs.length },
      "Push circuit breaker open, skipping dispatch"
    );
    return;
  }

  await Promise.allSettled(
    subs.map((sub) => sendNotificationWithResilience(sub, payload))
  );
}

export async function sendVendorPushNotifications(notifications = []) {
  if (!configured || !notifications.length) return;

  const grouped = new Map();
  notifications.forEach((notification) => {
    const vendorKey = String(notification.vendorId || "");
    if (!grouped.has(vendorKey)) grouped.set(vendorKey, []);
    grouped.get(vendorKey).push(notification);
  });

  for (const [vendorId, vendorNotifications] of grouped.entries()) {
    const subs = await PushSubscription.find({
      vendorId,
      role: "vendor",
      status: "active",
    }).lean();

    if (!subs.length) continue;

    const payload = JSON.stringify(
      toPayload(
        vendorNotifications[vendorNotifications.length - 1],
        {
          type: "vendor_notification",
          defaultRoute: "/vendor/app",
        }
      )
    );

    await dispatchNotifications(subs, payload);
  }
}

export async function sendAdminPushNotifications(notifications = []) {
  if (!configured || !notifications.length) return;

  const subs = await PushSubscription.find({
    role: "admin",
    status: "active",
  }).lean();

  if (!subs.length) return;

  const payload = JSON.stringify(
    toPayload(notifications[notifications.length - 1], {
      type: "admin_notification",
      defaultRoute: "/admin",
    })
  );

  await dispatchNotifications(subs, payload);
}

export async function sendCustomerPushNotifications(notifications = []) {
  if (!configured || !notifications.length) return;

  const grouped = new Map();
  notifications.forEach((notification) => {
    const customerKey = String(notification.customerId || "");
    if (!grouped.has(customerKey)) grouped.set(customerKey, []);
    grouped.get(customerKey).push(notification);
  });

  for (const [customerId, customerNotifications] of grouped.entries()) {
    if (!customerId || customerId === "null") continue;
    const subs = await PushSubscription.find({
      customerId,
      role: "customer",
      status: "active",
    }).lean();

    if (!subs.length) continue;

    const payload = JSON.stringify(
      toPayload(customerNotifications[customerNotifications.length - 1], {
        type: "customer_notification",
        defaultRoute: "/customer/home",
      })
    );

    await dispatchNotifications(subs, payload);
  }
}
