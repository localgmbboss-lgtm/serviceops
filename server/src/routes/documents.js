import { Router } from "express";
import mongoose from "mongoose";
import Document from "../models/Document.js";

const router = Router();

// GET /api/documents?ownerType=&driverId=&status=
router.get("/", async (req, res, next) => {
  try {
    const q = {};
    if (req.query.ownerType) q.ownerType = req.query.ownerType;
    if (req.query.status) q.status = req.query.status;
    if (req.query.driverId) {
      if (!mongoose.isValidObjectId(req.query.driverId)) return res.status(400).json({ message: "Invalid driverId" });
      q.driverId = req.query.driverId;
    }
    const list = await Document.find(q).sort({ uploadedAt: -1 }).lean();
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/documents
router.post("/", async (req, res, next) => {
  try {
    const { ownerType, driverId, title, kind, url, status, expiresAt, notes } = req.body;
    if (!ownerType || !title || !kind || !url) return res.status(400).json({ message: "Missing required fields" });
    if (ownerType === "driver" && driverId && !mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }
    const created = await Document.create({ ownerType, driverId: driverId || null, title, kind, url, status, expiresAt, notes });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// PATCH /api/documents/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const up = {};
    ["title","kind","url","status","expiresAt","notes"].forEach(k => {
      if (k in req.body) up[k] = req.body[k];
    });
    const doc = await Document.findByIdAndUpdate(req.params.id, up, { new: true });
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  } catch (e) { next(e); }
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const out = await Document.findByIdAndDelete(req.params.id);
    if (!out) return res.status(404).json({ message: "Document not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
