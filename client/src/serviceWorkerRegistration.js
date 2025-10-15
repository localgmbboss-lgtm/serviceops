// Based on CRA's default service worker registration helper (MIT licensed).
// Handles registration in production and graceful failure in unsupported browsers.

const isLocalhost = Boolean(
  typeof window !== "undefined" &&
    window.location &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "[::1]" ||
      window.location.hostname.match(
        /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/
      ))
);

export function register(config) {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }

  const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
  if (publicUrl.origin !== window.location.origin) {
    // Service worker won't work if PUBLIC_URL is on a different origin.
    return;
  }

  window.addEventListener("load", () => {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    if (isLocalhost) {
      // On localhost, simply register and log any issues.
      registerValidSW(swUrl, config);

      navigator.serviceWorker.ready
        .then(() => {
          console.log("Service worker ready (localhost).");
        })
        .catch(() => {});
    } else {
      registerValidSW(swUrl, config);
    }
  });
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      if (!registration) return;

      if (registration.waiting) {
        config?.onUpdate?.(registration);
      }

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === "installed") {
            if (navigator.serviceWorker.controller) {
              config?.onUpdate?.(registration);
            } else {
              config?.onSuccess?.(registration);
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error("Service worker registration failed:", error);
      config?.onError?.(error);
    });
}

export function unregister() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => {
      registration.unregister();
    })
    .catch(() => {});
}

