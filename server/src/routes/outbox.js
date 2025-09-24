import { Router } from "express";
import Outbox from "../models/Outbox.js";
const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const items = await Outbox.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(items);
  } catch (e) {
    next(e);
  }
});

export default router;
