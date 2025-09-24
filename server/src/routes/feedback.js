import { Router } from "express";
import Feedback from "../models/Feedback.js";

const router = Router();

// POST /api/feedback
router.post("/", async (req, res, next) => {
  try {
    const created = await Feedback.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

export default router;
