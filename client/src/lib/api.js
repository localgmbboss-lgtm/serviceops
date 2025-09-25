// src/lib/api.js
import axios from "axios";
import { API_BASE_URL } from "../config/env.js";

export const api = axios.create({ baseURL: API_BASE_URL });

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
