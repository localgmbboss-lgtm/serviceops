// Works in CRA (process.env) and Vite (import.meta.env). Also allows a window fallback.
const viteEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};
const craEnv = (typeof process !== "undefined" && process.env) || {};
const winEnv = typeof window !== "undefined" ? window : {};

export const GOOGLE_MAPS_KEY =
  viteEnv.VITE_GOOGLE_MAPS_KEY ||
  craEnv.REACT_APP_GOOGLE_MAPS_KEY ||
  winEnv.GOOGLE_MAPS_KEY || // optional <script> fallback
  "";
