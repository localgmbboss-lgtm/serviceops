import { API_BASE_URL, APP_BASE_URL } from "../config/env.js";
import { vendorApi } from "./vendorApi.js";

const SUPPORTS_SERVICE_WORKER =
  typeof window !== "undefined" && "serviceWorker" in navigator;
const SUPPORTS_PUSH =
  typeof window !== "undefined" && "PushManager" in window;

let vapidKeyPromise = null;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function fetchVapidKey() {
  if (vapidKeyPromise) return vapidKeyPromise;
  vapidKeyPromise = (async () => {
    const cached =
      typeof process !== "undefined"
        ? process.env.REACT_APP_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
        : "";
    if (cached) return cached;

    const response = await fetch(`${API_BASE_URL}/api/push/public-key`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Push messaging is not configured.");
    }
    const body = await response.json();
    if (!body?.key) {
      throw new Error("Push key missing from server response.");
    }
    return body.key;
  })();
  return vapidKeyPromise;
}

async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function createSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const vapidKey = await fetchVapidKey();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
  return subscription;
}

async function postVendorSubscription(subscription, meta = {}) {
  if (!subscription) return;
  try {
    await vendorApi.post("/api/vendor/feed/push/subscribe", {
      subscription,
      meta: {
        ...meta,
        appBaseUrl: APP_BASE_URL,
      },
    });
  } catch (error) {
    // Bubble the actual error so callers can decide what to do.
    throw error;
  }
}

export async function ensureVendorPushSubscription(options = {}) {
  if (!SUPPORTS_SERVICE_WORKER || !SUPPORTS_PUSH || typeof Notification === "undefined") {
    return { supported: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { supported: true, permission };
  }

  let subscription = await getExistingSubscription();
  if (!subscription) {
    subscription = await createSubscription();
  }

  await postVendorSubscription(subscription, {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    source: options.source || "vendor-app",
  });

  return {
    supported: true,
    permission: "granted",
    subscription,
  };
}

export async function syncSubscriptionFromWorker(subscription) {
  if (!subscription) return;
  try {
    await postVendorSubscription(subscription, {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      source: "sw-renew",
    });
  } catch (error) {
    console.warn("Failed to sync renewed push subscription:", error);
  }
}

