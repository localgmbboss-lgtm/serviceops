import { Server } from "socket.io";
import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";

let ioInstance = null;
let allowAllOrigins = false;
let allowedOriginSet = new Set();

const VENDOR_ROOM = "vendors/live";
const SOCKET_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
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

const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const sanitizeVendor = (input) => {
  if (!input) return null;
  const src = typeof input.toObject === "function" ? input.toObject() : input;
  const id = src?._id ? String(src._id) : null;
  if (!id) return null;

  return {
    _id: id,
    name: src?.name || "",
    phone: src?.phone || "",
    city: src?.city || "",
    lat: toFiniteNumber(src?.lat),
    lng: toFiniteNumber(src?.lng),
    lastSeenAt: toIsoString(src?.lastSeenAt || src?.updatedAt),
    updatesPaused: toBoolean(src?.updatesPaused),
    active: src?.active !== false,
    updatedAt: toIsoString(src?.updatedAt),
    createdAt: toIsoString(src?.createdAt),
  };
};

const fetchVendorSnapshot = async () => {
  const vendors = await Vendor.find().lean({ virtuals: false });
  return vendors.map(sanitizeVendor).filter(Boolean);
};

const isAllowedOrigin = (origin) => {
  if (allowAllOrigins) return true;
  if (!origin) return true;
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
    socket.join(VENDOR_ROOM);

    try {
      const snapshot = await fetchVendorSnapshot();
      socket.emit("vendors:snapshot", snapshot);
    } catch (error) {
      console.error("Failed to emit initial vendor snapshot", error);
    }

    socket.on("vendors:requestSnapshot", async (ack) => {
      try {
        const snapshot = await fetchVendorSnapshot();
        if (typeof ack === "function") {
          ack({ ok: true, vendors: snapshot });
        } else {
          socket.emit("vendors:snapshot", snapshot);
        }
      } catch (error) {
        console.error("vendors:requestSnapshot failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        } else {
          socket.emit("vendors:error", { message: "Unable to load vendors" });
        }
      }
    });

    socket.on("vendor:location", async (payload = {}, ack) => {
      const { vendorId, lat, lng } = payload;
      const id = typeof vendorId === "string" ? vendorId : String(vendorId || "");
      if (!mongoose.Types.ObjectId.isValid(id)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Invalid vendorId" });
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

      try {
        const vendor = await Vendor.findByIdAndUpdate(
          id,
          { $set: update },
          { new: true, lean: true }
        );

        if (!vendor) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "Vendor not found" });
          }
          return;
        }

        const sanitized = sanitizeVendor(vendor);
        broadcastVendorUpdate(sanitized);

        if (typeof ack === "function") {
          ack({ ok: true, vendor: sanitized });
        }
      } catch (error) {
        console.error("vendor:location update failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });

    socket.on("vendor:toggle", async (payload = {}, ack) => {
      const { vendorId, active, updatesPaused } = payload;
      const id = typeof vendorId === "string" ? vendorId : String(vendorId || "");
      if (!mongoose.Types.ObjectId.isValid(id)) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Invalid vendorId" });
        }
        return;
      }

      const update = {};
      if (active !== undefined) update.active = toBoolean(active);
      if (updatesPaused !== undefined) update.updatesPaused = toBoolean(updatesPaused);

      if (!Object.keys(update).length) {
        if (typeof ack === "function") ack({ ok: true });
        return;
      }

      try {
        const vendor = await Vendor.findByIdAndUpdate(
          id,
          { $set: update },
          { new: true, lean: true }
        );

        if (!vendor) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "Vendor not found" });
          }
          return;
        }

        const sanitized = sanitizeVendor(vendor);
        broadcastVendorUpdate(sanitized);
        if (typeof ack === "function") {
          ack({ ok: true, vendor: sanitized });
        }
      } catch (error) {
        console.error("vendor:toggle update failed", error);
        if (typeof ack === "function") {
          ack({ ok: false, error: error.message });
        }
      }
    });
  });

  return ioInstance;
};

export const getIo = () => ioInstance;

export const broadcastVendorSnapshot = async () => {
  if (!ioInstance) return;
  try {
    const snapshot = await fetchVendorSnapshot();
    ioInstance.to(VENDOR_ROOM).emit("vendors:snapshot", snapshot);
  } catch (error) {
    console.error("broadcastVendorSnapshot failed", error);
  }
};

export const broadcastVendorUpdate = (vendorLike) => {
  if (!ioInstance) return;
  const vendor = sanitizeVendor(vendorLike);
  if (!vendor) return;
  ioInstance.to(VENDOR_ROOM).emit("vendors:update", [vendor]);
};

export const broadcastVendorRemoval = (vendorId) => {
  if (!ioInstance) return;
  const id = typeof vendorId === "string" ? vendorId : String(vendorId || "");
  if (!id) return;
  ioInstance.to(VENDOR_ROOM).emit("vendors:remove", { ids: [id] });
};

export const withVendorSnapshot = async (callback) => {
  const snapshot = await fetchVendorSnapshot();
  return callback(snapshot);
};
