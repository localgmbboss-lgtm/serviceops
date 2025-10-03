import { Router } from "express";
import Driver from "../models/Driver.js";
import { requireFields } from "../lib/validate.js";
import {
  broadcastDriverRemoval,
  broadcastDriverUpdate,
} from "../realtime/index.js";

const router = Router();

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const coerceBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return Boolean(value);
};

const buildDriverPayload = (body) => ({
  name: body.name,
  phone: body.phone,
  city: body.city,
  rating: toFiniteNumber(body.rating) ?? 5,
  earningsSplit: toFiniteNumber(body.earningsSplit) ?? 0.7,
  available:
    typeof body.available === "boolean" ? body.available : coerceBoolean(body.available),
  documents: body.documents || undefined,
  lat: toFiniteNumber(body.lat) ?? undefined,
  lng: toFiniteNumber(body.lng) ?? undefined,
  heading: toFiniteNumber(body.heading) ?? toFiniteNumber(body.bearing) ?? undefined,
  speedKph: toFiniteNumber(body.speedKph ?? body.speed) ?? undefined,
  accuracy: toFiniteNumber(body.accuracy) ?? undefined,
  lastSeenAt: body.lastSeenAt ? new Date(body.lastSeenAt) : undefined,
});

const locationUpdateFromBody = (body) => {
  const lat = toFiniteNumber(body.lat);
  const lng = toFiniteNumber(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error("lat and lng are required numeric values");
    err.status = 400;
    throw err;
  }

  const update = {
    lat,
    lng,
    lastSeenAt: new Date(),
  };

  const heading = toFiniteNumber(body.heading ?? body.bearing);
  if (Number.isFinite(heading)) update.heading = heading;

  const speed = toFiniteNumber(body.speedKph ?? body.speed);
  if (Number.isFinite(speed)) update.speedKph = speed;

  const accuracy = toFiniteNumber(body.accuracy);
  if (Number.isFinite(accuracy)) update.accuracy = accuracy;

  if (body.available !== undefined) {
    update.available = coerceBoolean(body.available);
  }

  return update;
};

async function createDriver(req, res, next) {
  try {
    requireFields(req.body, ["name", "phone", "city"]);
    const payload = buildDriverPayload(req.body);
    const created = await Driver.create(payload);
    broadcastDriverUpdate(created);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

// CREATE driver  - POST /api/drivers
router.post("/", createDriver);

// LIST  - GET /api/drivers?available=true
router.get("/", async (req, res, next) => {
  try {
    const q = {};
    if (req.query.available === "true") q.available = true;
    const drivers = await Driver.find(q).lean();
    res.json(drivers);
  } catch (e) {
    next(e);
  }
});

// PATCH availability/docs - PATCH /api/drivers/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const update = {};

    if (req.body.documents) update.documents = req.body.documents;
    if (req.body.earningsSplit !== undefined) {
      const earningsSplit = toFiniteNumber(req.body.earningsSplit);
      if (Number.isFinite(earningsSplit)) update.earningsSplit = earningsSplit;
    }
    if (req.body.rating !== undefined) {
      const rating = toFiniteNumber(req.body.rating);
      if (Number.isFinite(rating)) update.rating = rating;
    }
    if (req.body.available !== undefined) {
      update.available = coerceBoolean(req.body.available);
    }
    const lat = toFiniteNumber(req.body.lat);
    const lng = toFiniteNumber(req.body.lng);
    if (Number.isFinite(lat)) update.lat = lat;
    if (Number.isFinite(lng)) update.lng = lng;
    if (req.body.lastSeenAt) update.lastSeenAt = new Date(req.body.lastSeenAt);

    const driver = await Driver.findByIdAndUpdate(id, update, { new: true });
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    broadcastDriverUpdate(driver);
    res.json(driver);
  } catch (e) {
    next(e);
  }
});

// UPDATE location - PATCH /api/drivers/:id/location  { lat, lng }
router.patch("/:id/location", async (req, res, next) => {
  try {
    const { id } = req.params;
    const update = locationUpdateFromBody(req.body);

    const driver = await Driver.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    broadcastDriverUpdate(driver);
    res.json(driver);
  } catch (e) {
    next(e);
  }
});

// Duplicate legacy POST handler retained for compatibility
router.post("/", createDriver);

// DELETE /api/drivers/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const removed = await Driver.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: "Driver not found" });
    broadcastDriverRemoval(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

