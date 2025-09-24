// client/src/lib/auth.js
import { api } from "./api";
export function attachCustomerToken() {
  api.interceptors.request.use((config) => {
    const t = localStorage.getItem("customerToken");
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
  });
}
