import { Server } from "socket.io";
import mongoose from "mongoose";
import Driver from "../models/Driver.js";

let ioInstance = null;
let allowAllOrigins = false;
let allowedOriginSet = new Set();

const DRIVER_ROOM = "drivers/live";
const SOCKET_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return Boolean(value);
};

const sanitizeDriver = (input) => {
  if (!input) return null;
  const src = typeof input.toObject === "function" ? input.toObject() : input;
  const id = src?._id ? String(src._id) : null;
  if (!id) return null;

  return {
    _id: id,
    name: src?.name || "",
    phone: src?.phone || "",
    city: src?.city || "",
    available: toBoolean(src?.available),
    lat: toFiniteNumber(src?.lat),
    lng: toFiniteNumber(src?.lng),
    heading: toFiniteNumber(src?.heading) ?? toFiniteNumber(src?.bearing),
    speedKph: toFiniteNumber(src?.speedKph ?? src?.speed ?? src?.velocity),
    accuracy: toFiniteNumber(src?.accuracy),
    lastSeenAt: toIsoString(src?.lastSeenAt),
    updatedAt: toIsoString(src?.updatedAt),
    createdAt: toIsoString(src?.createdAt),
  };
};

const fetchDriverSnapshot = async () => {
  const drivers = await Driver.find().lean({ virtuals: false });
  return drivers.map(sanitizeDriver).filter(Boolean);
};

const isAllowedOrigin = (origin) => {
  if (allowAllOrigins) return true;
  if (!origin) return true; // same-site / mobile clients
  const candidate = origin.trim().replace(/\/$/, "");
  return allowedOriginSet.has(candidate);
};

const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`Origin not allowed: ${origin}`));
  }
};

export const initRealtime = (httpServer, options = {}) => {
  if (ioInstance) {
    return ioInstance;
  }

  allowAllOrigins = options.allowAllOrigins === true;
  const providedOrigins = Array.isArray(options.allowedOrigins)
    ? options.allowedOrigins.filter(Boolean)
    : [];
  allowedOriginSet = new Set(providedOrigins.map((origin) => origin.replace(/\/$/, "")));

  ioInstance = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: SOCKET_METHODS,
      credentials: true,
    },
  });

  ioInstance.on("connection", async (socket) => {
    socket.join(DRIVER_ROOM);

    try {
      const snapshot = await fetchDriverSnapshot();
      socket.emit("drivers:snapshot", snapshot);
    } catch (error) {
      console.error("Failed to emit initial driver snapshot", error);
    }

    socket.on("drivers:requestSnapshot", async (ack) => {
      try {
        const snapshot = await fetchDriverSnapshot();
        if (typeof ack === "function") {
          ack({ ok: true, drivers: snapshot });
        } else {
          socket.emit("drivers:snapshot", snapshot);
        }
      } catch (error) {
        console.error("drivers:requestSnapshot failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        } else {
          socket.emit("drivers:error", {
            message: "Unable to load drivers",
          });
        }
      }
    });

    socket.on("driver:location", async (payload = {}, ack) => {
      const { driverId, lat, lng, heading, speedKph, speed, accuracy, available } = payload;
      const id = typeof driverId === "string" ? driverId : String(driverId || "");
      if (!mongoose.Types.ObjectId.isValid(id)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Invalid driverId" });
        }
        return;
      }

      const numericLat = toFiniteNumber(lat);
      const numericLng = toFiniteNumber(lng);
      if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Invalid coordinates" });
        }
        return;
      }

      const update = {
        lat: numericLat,
        lng: numericLng,
        lastSeenAt: new Date(),
      };

      const numericHeading = toFiniteNumber(heading);
      if (Number.isFinite(numericHeading)) update.heading = numericHeading;

      const numericSpeed = toFiniteNumber(speedKph ?? speed);
      if (Number.isFinite(numericSpeed)) update.speedKph = numericSpeed;

      const numericAccuracy = toFiniteNumber(accuracy);
      if (Number.isFinite(numericAccuracy)) update.accuracy = numericAccuracy;

      if (available !== undefined) {
        update.available = toBoolean(available);
      }

      try {
        const driver = await Driver.findByIdAndUpdate(
          id,
          { $set: update },
          { new: true, lean: true }
        );

        if (!driver) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "Driver not found" });
          }
          return;
        }

        const sanitized = sanitizeDriver(driver);
        broadcastDriverUpdate(sanitized);

        if (typeof ack === "function") {
          ack({ ok: true, driver: sanitized });
        }
      } catch (error) {
        console.error("driver:location update failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("driver:availability", async (payload = {}, ack) => {
      const { driverId, available } = payload;
      const id = typeof driverId === "string" ? driverId : String(driverId || "");
      if (!mongoose.Types.ObjectId.isValid(id)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Invalid driverId" });
        }
        return;
      }

      try {
        const driver = await Driver.findByIdAndUpdate(
          id,
          { $set: { available: toBoolean(available) } },
          { new: true, lean: true }
        );

        if (!driver) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "Driver not found" });
          }
          return;
        }

        const sanitized = sanitizeDriver(driver);
        broadcastDriverUpdate(sanitized);
        if (typeof ack === "function") {
          ack({ ok: true, driver: sanitized });
        }
      } catch (error) {
        console.error("driver:availability update failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });
  });

  return ioInstance;
};

export const getIo = () => ioInstance;

export const broadcastDriverSnapshot = async () => {
  if (!ioInstance) return;
  try {
    const snapshot = await fetchDriverSnapshot();
    ioInstance.to(DRIVER_ROOM).emit("drivers:snapshot", snapshot);
  } catch (error) {
    console.error("broadcastDriverSnapshot failed", error);
  }
};

export const broadcastDriverUpdate = (driverLike) => {
  if (!ioInstance) return;
  const driver = sanitizeDriver(driverLike);
  if (!driver) return;
  ioInstance.to(DRIVER_ROOM).emit("drivers:update", [driver]);
};

export const broadcastDriverRemoval = (driverId) => {
  if (!ioInstance) return;
  const id = typeof driverId === "string" ? driverId : String(driverId || "");
  if (!id) return;
  ioInstance.to(DRIVER_ROOM).emit("drivers:remove", { ids: [id] });
};

export const withDriverSnapshot = async (callback) => {
  const snapshot = await fetchDriverSnapshot();
  return callback(snapshot);
};
