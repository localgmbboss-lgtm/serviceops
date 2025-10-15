import { Router } from "express";
import { getVapidPublicKey, isPushConfigured } from "../lib/push.js";

const router = Router();

router.get("/public-key", (_req, res) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ message: "Push messaging is not configured." });
  }
  const key = getVapidPublicKey();
  return res.json({ key });
});

export default router;

