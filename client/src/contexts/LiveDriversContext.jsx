import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "../config/env";
import { api } from "../lib/api";

const LiveDriversContext = createContext({
  drivers: [],
  connected: false,
  connecting: false,
  status: "idle",
  error: "",
  lastUpdatedAt: null,
  socket: null,
  requestSnapshot: () => Promise.resolve({ ok: false }),
});

const FALLBACK_REALTIME_URL = "http://localhost:5000";
const hasWindow = typeof window !== "undefined";
const POLL_INTERVAL_MS = 15000;

const trimTrailingSlash = (value) => {
  if (!value) return "";
  return String(value).replace(/\/+$/, "");
};

const resolveRealtimeOrigin = () => {
  const candidate = trimTrailingSlash(API_BASE_URL);
  if (candidate && /^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  if (hasWindow) {
    if (candidate && candidate.startsWith("/")) {
      return trimTrailingSlash(`${window.location.origin}${candidate}`);
    }
    if (window.location?.origin) {
      return trimTrailingSlash(window.location.origin);
    }
  }
  return FALLBACK_REALTIME_URL;
};

const isLocalOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const createSocket = () => {
  const origin = resolveRealtimeOrigin();
  const preferWebsocket = isLocalOrigin(origin);
  const transports = preferWebsocket ? ["polling", "websocket"] : ["polling"];
  const socket = io(origin, {
    path: "/socket.io",
    transports,
    withCredentials: true,
    autoConnect: false,
    upgrade: preferWebsocket,
  });
  socket.__preferWebsocket = preferWebsocket;
  socket.__forcedPolling = !preferWebsocket;
  return socket;
};
const sanitizeDrivers = (list) => {
  if (!Array.isArray(list)) return [];

  return list
    .map((driver) => {
      if (!driver || !driver._id) return null;
      const safeNumber = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const num = typeof value === "number" ? value : Number(value);
        return Number.isFinite(num) ? num : null;
      };

      return {
        _id: String(driver._id),
        name: driver.name || "",
        phone: driver.phone || "",
        city: driver.city || "",
        available: Boolean(driver.available),
        lat: safeNumber(driver.lat),
        lng: safeNumber(driver.lng),
        heading: safeNumber(driver.heading ?? driver.bearing),
        speedKph: safeNumber(driver.speedKph ?? driver.speed ?? driver.velocity),
        accuracy: safeNumber(driver.accuracy),
        lastSeenAt: driver.lastSeenAt || driver.updatedAt || null,
        updatedAt: driver.updatedAt || null,
        createdAt: driver.createdAt || null,
      };
    })
    .filter(Boolean);
};

export function LiveDriversProvider({ children }) {
  const [drivers, setDrivers] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const lastUpdatedAtRef = useRef(null);
  const driversRef = useRef(new Map());
  const socketRef = useRef(null);
  const pollTimerRef = useRef(null);

  const applySnapshot = useCallback((list) => {
    const sanitized = sanitizeDrivers(list);
    const map = driversRef.current;
    map.clear();
    sanitized.forEach((driver) => {
      map.set(driver._id, driver);
    });
    lastUpdatedAtRef.current = Date.now();
    setDrivers(Array.from(map.values()));
  }, []);

  const applyUpdate = useCallback((updates) => {
    const sanitized = sanitizeDrivers(updates);
    if (!sanitized.length) return;
    const map = driversRef.current;
    sanitized.forEach((driver) => {
      map.set(driver._id, {
        ...(map.get(driver._id) || {}),
        ...driver,
        lastSeenAt: driver.lastSeenAt || map.get(driver._id)?.lastSeenAt || null,
      });
    });
    lastUpdatedAtRef.current = Date.now();
    setDrivers(Array.from(map.values()));
  }, []);

  const applyRemoval = useCallback((payload) => {
    if (!payload) return;
    const ids = Array.isArray(payload.ids)
      ? payload.ids
      : Array.isArray(payload)
      ? payload
      : [];
    if (!ids.length) return;
    const map = driversRef.current;
    let mutated = false;
    ids.forEach((id) => {
      const key = String(id);
      if (map.has(key)) {
        map.delete(key);
        mutated = true;
      }
    });
    if (mutated) {
      lastUpdatedAtRef.current = Date.now();
      setDrivers(Array.from(map.values()));
    }
  }, []);

  const fetchDriversSnapshot = useCallback(async () => {
    try {
      const { data } = await api.get("/api/drivers");
      applySnapshot(data);
      setError("");
      return { ok: true, drivers: sanitizeDrivers(data) };
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to load drivers";
      setError(message);
      return { ok: false, error: message };
    }
  }, [applySnapshot]);

  const startPolling = useCallback(() => {
    if (typeof window === "undefined") return;
    if (pollTimerRef.current) return;
    fetchDriversSnapshot();
    pollTimerRef.current = window.setInterval(
      fetchDriversSnapshot,
      POLL_INTERVAL_MS
    );
  }, [fetchDriversSnapshot]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current && typeof window !== "undefined") {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.connected) {
      return new Promise((resolve) => {
        socket.emit("drivers:requestSnapshot", (response) => {
          if (response?.ok && Array.isArray(response.drivers)) {
            applySnapshot(response.drivers);
            resolve({ ok: true, drivers: sanitizeDrivers(response.drivers) });
          } else {
            const err = response?.error || "Unable to refresh drivers";
            if (err) setError(err);
            resolve({ ok: false, error: err });
          }
        });
      });
    }

    if (socket) {
      socket.connect();
      if (!socket.__forcedPolling) {
        return new Promise((resolve) => {
          socket.emit("drivers:requestSnapshot", (response) => {
            if (response?.ok && Array.isArray(response.drivers)) {
              applySnapshot(response.drivers);
              resolve({ ok: true, drivers: sanitizeDrivers(response.drivers) });
            } else {
              const err = response?.error || "Unable to refresh drivers";
              if (err) setError(err);
              resolve({ ok: false, error: err });
            }
          });
        });
      }
    }

    return fetchDriversSnapshot();
  }, [applySnapshot, fetchDriversSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!socketRef.current) {
      socketRef.current = createSocket();
    }

    const socket = socketRef.current;

    const handleConnect = () => {
      setStatus("connected");
      setError("");
      stopPolling();
      requestSnapshot();
    };

    const handleDisconnect = () => {
      setStatus("disconnected");
      startPolling();
    };

    const handleConnecting = () => {
      setStatus("connecting");
    };

    const handleConnectError = (err) => {
      const socket = socketRef.current;
      if (socket && socket.__preferWebsocket && !socket.__forcedPolling) {
        socket.__forcedPolling = true;
        if (socket.io?.opts) {
          socket.io.opts.transports = ["polling"];
          socket.io.opts.upgrade = false;
        }
        setStatus("connecting");
        startPolling();
        socket.connect();
        return;
      }
      startPolling();
      setStatus("error");
      setError(err?.message || "Socket error");
    };

    const handleSnapshot = (payload) => {
      applySnapshot(payload);
    };

    const handleUpdate = (payload) => {
      applyUpdate(payload);
    };

    const handleRemove = (payload) => {
      applyRemoval(payload);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("reconnect", handleConnect);
    socket.io.on("reconnect_attempt", handleConnecting);
    socket.on("drivers:snapshot", handleSnapshot);
    socket.on("drivers:update", handleUpdate);
    socket.on("drivers:remove", handleRemove);
    socket.on("drivers:error", handleConnectError);

    setStatus(socket.connected ? "connected" : "connecting");
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("reconnect", handleConnect);
      socket.io.off("reconnect_attempt", handleConnecting);
      socket.off("drivers:snapshot", handleSnapshot);
      socket.off("drivers:update", handleUpdate);
      socket.off("drivers:remove", handleRemove);
      socket.off("drivers:error", handleConnectError);
      stopPolling();
    };
  }, [applySnapshot, applyUpdate, applyRemoval, requestSnapshot, startPolling, stopPolling]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (status === "connected") {
      stopPolling();
    } else {
      startPolling();
    }
    return () => {
      stopPolling();
    };
  }, [status, startPolling, stopPolling]);

  const value = useMemo(
    () => ({
      drivers,
      connected: status === "connected",
      connecting: status === "connecting",
      status,
      error,
      lastUpdatedAt: lastUpdatedAtRef.current,
      socket: socketRef.current,
      requestSnapshot,
    }),
    [drivers, status, error, requestSnapshot]
  );

  return (
    <LiveDriversContext.Provider value={value}>
      {children}
    </LiveDriversContext.Provider>
  );
}

export const useLiveDrivers = () => useContext(LiveDriversContext);




