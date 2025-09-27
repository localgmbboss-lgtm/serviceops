// Works in CRA (process.env) and Vite (import.meta.env). Also allows a window fallback.
const viteEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};
const craEnv = (typeof process !== "undefined" && process.env) || {};
const hasWindow = typeof window !== "undefined";
const win = hasWindow ? window : {};
const runtimeWindowEnv = hasWindow ? win.__ENV__ : undefined;

const windowApiUrl =
  (hasWindow && (win.API_URL || win.__API_URL__)) || runtimeWindowEnv?.API_URL;

const runtimeApiUrl =
  viteEnv.VITE_API_URL ||
  craEnv.REACT_APP_API_URL ||
  windowApiUrl;

const hostname =
  hasWindow && typeof win.location?.hostname === "string"
    ? win.location.hostname
    : "";

const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
const DEFAULT_PRODUCTION_API = "https://serviceops.onrender.com";

export const API_BASE_URL =
  runtimeApiUrl ||
  (isLocalhost ? "http://localhost:5000" : DEFAULT_PRODUCTION_API);

function computeGoogleMapsKey() {
  const preloadedKey =
    viteEnv.VITE_GOOGLE_MAPS_KEY ||
    craEnv.REACT_APP_GOOGLE_MAPS_KEY ||
    runtimeWindowEnv?.GOOGLE_MAPS_KEY ||
    (hasWindow ? win.GOOGLE_MAPS_KEY : "") ||
    "";

  if (!hasWindow) return preloadedKey || "";

  return (
    preloadedKey ||
    window.__ENV__?.GOOGLE_MAPS_KEY ||
    window.GOOGLE_MAPS_KEY ||
    ""
  );
}

export function getGoogleMapsKey() {
  const key = computeGoogleMapsKey();

  if (hasWindow) {
    window.__ENV__ = {
      ...(window.__ENV__ || {}),
      API_URL: API_BASE_URL,
      GOOGLE_MAPS_KEY: key,
    };

    if (key) {
      window.GOOGLE_MAPS_KEY = key;
    }
  }

  return key;
}

export const GOOGLE_MAPS_KEY = getGoogleMapsKey();
