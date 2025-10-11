import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useNotifications } from "./NotificationsContext";
import { recordAuditEvent } from "../utils/auditLog";

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
  const vendorsSnapshotRef = useRef(new Map());
  const vendorsInitializedRef = useRef(false);
  const { publish } = useNotifications();

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

  useEffect(() => {
    if (!publish) return;
    const previous = vendorsSnapshotRef.current;
    const next = new Map();
    const isInitial = !vendorsInitializedRef.current;

    vendors.forEach((vendor) => {
      if (!vendor?._id) return;
      const key = vendor._id;
      next.set(key, vendor);

      if (isInitial) {
        return;
      }

      const prevVendor = previous.get(key);
      const vendorName = vendor.name || vendor.phone || "Vendor";
      if (!prevVendor) {
        publish({
          title: "New vendor detected",
          body: `${vendorName} is now visible on the live map.`,
          severity: "info",
          meta: {
            role: "admin",
            kind: "vendor",
            vendorId: key,
            route: "/admin/vendors",
          },
          dedupeKey: `admin:vendor:new:${key}`,
        });
        recordAuditEvent({
          title: "Vendor detected",
          message: `${vendorName} appeared in the live feed.`,
          type: "info",
          meta: { vendorId: key },
        });
        return;
      }

      const wasActive = prevVendor.active !== false;
      const isActive = vendor.active !== false;

      if (wasActive !== isActive) {
        const becameActive = isActive && !wasActive;
        publish({
          title: becameActive ? "Vendor online" : "Vendor offline",
          body: `${vendorName} ${becameActive ? "is now active" : "went offline"}.`,
          severity: becameActive ? "success" : "warning",
          meta: {
            role: "admin",
            kind: "vendor",
            vendorId: key,
            route: "/admin/vendors",
            status: isActive ? "active" : "offline",
          },
          dedupeKey: `admin:vendor:${key}:active:${isActive ? "1" : "0"}`,
        });
        recordAuditEvent({
          title: becameActive ? "Vendor online" : "Vendor offline",
          message: `${vendorName} ${becameActive ? "came online" : "went offline"}.`,
          type: becameActive ? "success" : "warning",
          meta: { vendorId: key, active: isActive },
        });
      }
    });

    if (!isInitial) {
      previous.forEach((prevVendor, key) => {
        if (!next.has(key)) {
          const vendorName = prevVendor?.name || prevVendor?.phone || "Vendor";
          publish({
            title: "Vendor removed",
            body: `${vendorName} is no longer in the live feed.`,
            severity: "info",
            meta: {
              role: "admin",
              kind: "vendor",
              vendorId: key,
              route: "/admin/vendors",
            },
            dedupeKey: `admin:vendor:${key}:removed`,
          });
          recordAuditEvent({
            title: "Vendor removed",
            message: `${vendorName} disappeared from live tracking.`,
            type: "info",
            meta: { vendorId: key },
          });
        }
      });
    }

    vendorsSnapshotRef.current = next;
    if (!vendorsInitializedRef.current && vendors.length > 0) {
      vendorsInitializedRef.current = true;
    }
  }, [vendors, publish]);

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
