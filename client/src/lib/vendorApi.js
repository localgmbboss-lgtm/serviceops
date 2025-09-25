// client/src/lib/vendorApi.js
import axios from "axios";
import { API_BASE_URL } from "../config/env.js";

export const vendorApi = axios.create({ baseURL: API_BASE_URL });

vendorApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("vendorToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
