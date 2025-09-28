import { Router } from "express";
import Settings from "../models/Settings.js";

const router = Router();

// GET /api/settings  (create default if missing)
router.get("/", async (_req, res, next) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    res.json(s);
  } catch (e) { next(e); }
});

// PUT /api/settings  (update allowed fields)
router.put("/", async (req, res, next) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    // shallow merge only on known sections
    const body = req.body || {};
    ["mode","workflow","defaults","intervals","reviews","commission"].forEach(k=>{
      if (k in body) s[k] = { ...(s[k]||{}), ...(body[k]||{}) };
    });
    await s.save();
    res.json(s);
  } catch (e) { next(e); }
});

export default router;

