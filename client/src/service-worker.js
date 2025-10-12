/* eslint-disable no-restricted-globals */
const APP_SHELL = "serviceops-app-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== APP_SHELL)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function resolveNotificationData(data) {
  if (!data) return {};
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (e) {
      return { body: data };
    }
  }
  if (data.json) {
    try {
      return data.json();
    } catch (e) {
      return {};
    }
  }
  return data;
}

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }
  const payload = resolveNotificationData(event.data);
  const title = payload.title || "ServiceOps";
  const options = {
    body: payload.body || "",
    data: payload,
    tag: payload.tag || payload.meta?.dedupeKey || undefined,
    badge: payload.badge || "/icons/icon-72x72.png",
    icon: payload.icon || "/icons/icon-192x192.png",
    requireInteraction: payload.requireInteraction || false,
    renotify: Boolean(payload.renotify),
    actions: payload.actions || [],
  };

  event.waitUntil(
    (async () => {
      const clientsList = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      clientsList.forEach((client) => {
        client.postMessage({
          type: "PUSH_NOTIFICATION",
          payload,
        });
      });
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const targetUrl =
    payload.url ||
    payload.meta?.absoluteUrl ||
    (payload.meta?.route ? payload.meta.route : null);

  if (!targetUrl) {
    return;
  }

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        const url = new URL(client.url);
        if (targetUrl && (client.url === targetUrl || url.pathname === targetUrl)) {
          client.focus();
          client.postMessage({
            type: "PUSH_NOTIFICATION_CLICK",
            payload,
          });
          return;
        }
      }

      await clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        const allClients = await clients.matchAll({
          includeUncontrolled: true,
          type: "window",
        });
        allClients.forEach((client) => {
          client.postMessage({
            type: "PUSH_SUBSCRIPTION_CHANGED",
            subscription: newSubscription ? newSubscription.toJSON() : null,
          });
        });
      } catch (error) {
        console.error("Failed to renew push subscription:", error);
      }
    })()
  );
});

// Simple network-first fetch handler for same-origin navigations.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("index.html").then((cachedResponse) => cachedResponse || fetch(request))
    );
  }
});
