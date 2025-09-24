// src/lib/api.js
import axios from "axios";

const metaEnv = (() => {
  try {
    return import.meta.env;
  } catch (err) {
    return undefined;
  }
})();

const API =
  (metaEnv && metaEnv.VITE_API_URL) ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:5000";

export const api = axios.create({ baseURL: API });

// keep one token key only
let AUTH_TOKEN = localStorage.getItem("auth_token") || "";

export function setAuthToken(token) {
  AUTH_TOKEN = token || "";
  if (AUTH_TOKEN) {
    api.defaults.headers.common.Authorization = `Bearer ${AUTH_TOKEN}`;
    localStorage.setItem("auth_token", AUTH_TOKEN);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("auth_token");
  }
}

// init on load
if (AUTH_TOKEN) {
  api.defaults.headers.common.Authorization = `Bearer ${AUTH_TOKEN}`;
}
