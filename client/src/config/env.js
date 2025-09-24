// Works in CRA (process.env) and Vite (import.meta.env). Also allows a window fallback.
const viteEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};
const craEnv = (typeof process !== "undefined" && process.env) || {};
const winEnv = typeof window !== "undefined" ? window : {};

const windowApiUrl =
  winEnv.API_URL ||
  winEnv.__API_URL__ ||
  (winEnv.__ENV__ && winEnv.__ENV__.API_URL);

const runtimeApiUrl =
  viteEnv.VITE_API_URL ||
  craEnv.REACT_APP_API_URL ||
  windowApiUrl;

const hostname =
  typeof winEnv.location?.hostname === "string"
    ? winEnv.location.hostname
    : "";

const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
const DEFAULT_PRODUCTION_API = "https://serviceops.onrender.com";

export const API_BASE_URL =
  runtimeApiUrl ||
  (isLocalhost ? "http://localhost:5000" : DEFAULT_PRODUCTION_API);

export const GOOGLE_MAPS_KEY =
  viteEnv.VITE_GOOGLE_MAPS_KEY ||
  craEnv.REACT_APP_GOOGLE_MAPS_KEY ||
  winEnv.GOOGLE_MAPS_KEY || // optional <script> fallback
  "";
