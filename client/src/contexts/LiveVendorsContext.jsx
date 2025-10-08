import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

const LiveVendorsContext = createContext({
  vendors: [],
  status: "idle",
  error: "",
  lastUpdatedAt: null,
  refresh: () => Promise.resolve(),
});

const POLL_INTERVAL_MS = 20000;

const sanitizeVendors = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((vendor) => {
      if (!vendor) return null;
      const safeNumber = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const num = typeof value === "number" ? value : Number(value);
        return Number.isFinite(num) ? num : null;
      };
      return {
        _id: vendor._id ? String(vendor._id) : null,
        name: vendor.name || "",
        phone: vendor.phone || "",
        city: vendor.city || "",
        services: Array.isArray(vendor.services) ? vendor.services : [],
        heavyDuty: Boolean(vendor.heavyDuty),
        active: vendor.active !== false,
        lat: safeNumber(vendor.lat),
        lng: safeNumber(vendor.lng),
        lastSeenAt: vendor.lastSeenAt || vendor.updatedAt || null,
        updatedAt: vendor.updatedAt || null,
      };
    })
    .filter((vendor) => vendor && vendor._id);
};

export function LiveVendorsProvider({ children }) {
  const [vendors, setVendors] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const lastUpdatedRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setStatus((prev) => (prev === "ready" ? "refreshing" : "loading"));
      const { data } = await api.get("/api/admin/vendors");
      const sanitized = sanitizeVendors(data);
      setVendors(sanitized);
      lastUpdatedRef.current = Date.now();
      setStatus("ready");
      setError("");
    } catch (e) {
      setStatus("error");
      setError(e?.response?.data?.message || e?.message || "Unable to load vendors");
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(load, POLL_INTERVAL_MS);
  }, [load]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    load();
    startPolling();
    return () => {
      stopPolling();
    };
  }, [load, startPolling, stopPolling]);

  const value = useMemo(
    () => ({
      vendors,
      status,
      error,
      lastUpdatedAt: lastUpdatedRef.current,
      refresh: load,
    }),
    [vendors, status, error, load]
  );

  return (
    <LiveVendorsContext.Provider value={value}>
      {children}
    </LiveVendorsContext.Provider>
  );
}

export const useLiveVendors = () => useContext(LiveVendorsContext);

