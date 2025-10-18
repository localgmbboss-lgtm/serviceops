// server/src/lib/authTokens.js
import jwt from "jsonwebtoken";

const DEFAULT_SECRET = "dev_secret";

const getSharedSecret = () =>
  process.env.JWT_SECRET && process.env.JWT_SECRET.length
    ? process.env.JWT_SECRET
    : DEFAULT_SECRET;

const normalizeId = (value) => {
  if (!value) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
};

/**
 * Decode a ServiceOps authentication token (customer or vendor).
 * Returns { role: "customer" | "vendor" | "admin" | "unknown", id, raw }
 * where id is a string ObjectId when available.
 */
export function decodeAppToken(token) {
  if (!token) {
    const err = new Error("Missing token");
    err.status = 401;
    throw err;
  }

  try {
    const payload = jwt.verify(token, getSharedSecret());
    if (payload?.role === "customer" && payload?.sub) {
      return { role: "customer", id: normalizeId(payload.sub), raw: payload };
    }

    // Some vendor tokens are signed with { vid: vendorId }
    if (payload?.vid) {
      return { role: "vendor", id: normalizeId(payload.vid), raw: payload };
    }

    if (payload?.role === "vendor" && (payload?.sub || payload?.id)) {
      return {
        role: "vendor",
        id: normalizeId(payload.sub || payload.id),
        raw: payload,
      };
    }

    if (payload?.role === "admin" && (payload?.sub || payload?.id)) {
      return {
        role: "admin",
        id: normalizeId(payload.sub || payload.id),
        raw: payload,
      };
    }

    const err = new Error("Unsupported token payload");
    err.status = 401;
    throw err;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      error.status = 401;
    }
    throw error;
  }
}

export function extractTokenFromAuthHeader(authHeader = "") {
  if (!authHeader) return null;
  if (typeof authHeader !== "string") return null;
  const trimmed = authHeader.trim();
  if (!trimmed.length) return null;
  if (trimmed.startsWith("Bearer ")) return trimmed.slice(7).trim();
  return trimmed;
}

export function decodeRequestActor(req) {
  const token = extractTokenFromAuthHeader(req.headers?.authorization || "");
  if (!token) {
    const err = new Error("Missing token");
    err.status = 401;
    throw err;
  }
  return decodeAppToken(token);
}
