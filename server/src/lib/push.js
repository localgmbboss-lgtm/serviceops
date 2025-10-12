import webPush from "web-push";
import PushSubscription from "../models/PushSubscription.js";

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

export async function registerVendorSubscription(vendorId, payload = {}) {
  if (!configured) {
    throw new Error("Push messaging not configured.");
  }

  if (!payload?.subscription || !payload.subscription.endpoint) {
    throw new Error("Invalid subscription payload.");
  }

  const rawSubscription = payload.subscription;
  const subscription =
    typeof rawSubscription?.toJSON === "function"
      ? rawSubscription.toJSON()
      : rawSubscription;
  const userAgent = payload.meta?.userAgent || payload.userAgent || "";
  const platform = payload.meta?.platform || payload.platform || "";
  const source = payload.meta?.source || payload.source || "";
  const appBaseUrl = payload.meta?.appBaseUrl || payload.appBaseUrl || "";

  const doc = await PushSubscription.findOneAndUpdate(
    { "subscription.endpoint": subscription.endpoint },
    {
      $set: {
        vendorId,
        role: "vendor",
        subscription,
        userAgent,
        platform,
        source,
        appBaseUrl,
        status: "active",
        failCount: 0,
        lastError: "",
        lastUsedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

export async function unregisterSubscription(endpoint) {
  if (!endpoint) return;
  try {
    await PushSubscription.deleteOne({ "subscription.endpoint": endpoint });
  } catch (error) {
    console.error("Failed to unregister push subscription:", error);
  }
}

function toPayload(notification, defaultBaseUrl) {
  const meta = notification.meta || {};
  const route = meta.route || "/vendor/app";
  const appBase = meta.appBaseUrl || defaultBaseUrl || "";
  const absoluteUrl =
    meta.absoluteUrl || (appBase ? `${appBase}${route.startsWith("/") ? "" : "/"}${route}` : null);

  return {
    type: "vendor_notification",
    title: notification.title || "ServiceOps",
    body: notification.body || "",
    meta: {
      ...meta,
      route,
      absoluteUrl,
      notificationId: notification._id,
    },
    createdAt: notification.createdAt,
    vendorId: notification.vendorId,
    url: absoluteUrl || route,
  };
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
      toPayload(vendorNotifications[vendorNotifications.length - 1])
    );

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webPush.sendNotification(sub.subscription, payload);
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
        } catch (error) {
          const status = error?.statusCode;
          const body = error?.body || "";
          const isGone = status === 404 || status === 410;
          if (isGone) {
            await PushSubscription.deleteOne({ _id: sub._id });
          } else {
            await PushSubscription.updateOne(
              { _id: sub._id },
              {
                $inc: { failCount: 1 },
                $set: {
                  lastError: body || error?.message || "push send failed",
                },
              }
            );
          }
        }
      })
    );
  }
}
