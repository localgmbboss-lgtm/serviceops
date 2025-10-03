import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "../config/env";

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

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) {
      return Promise.resolve({ ok: false, error: "Socket not ready" });
    }
    if (!socket.connected) {
      socket.connect();
    }
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
  }, [applySnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!socketRef.current) {
      socketRef.current = io(API_BASE_URL, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        withCredentials: true,
        autoConnect: false,
      });
    }

    const socket = socketRef.current;

    const handleConnect = () => {
      setStatus("connected");
      setError("");
      requestSnapshot();
    };

    const handleDisconnect = () => {
      setStatus("disconnected");
    };

    const handleConnecting = () => {
      setStatus("connecting");
    };

    const handleConnectError = (err) => {
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
    };
  }, [applySnapshot, applyUpdate, applyRemoval, requestSnapshot]);

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

