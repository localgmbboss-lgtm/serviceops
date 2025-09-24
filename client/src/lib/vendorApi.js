// client/src/lib/vendorApi.js
import axios from "axios";
const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const vendorApi = axios.create({ baseURL: API });

vendorApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("vendorToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
