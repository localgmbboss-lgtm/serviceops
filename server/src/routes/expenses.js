import { Router } from "express";
import Expense from "../models/Expense.js";

const r = Router();

r.get("/", async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const q = {};
    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);
      if (to) q.date.$lte = new Date(to);
    }
    const items = await Expense.find(q).sort({ date: -1 }).limit(200).lean();
    res.json(items);
  } catch (e) {
    next(e);
  }
});

r.post("/", async (req, res, next) => {
  try {
    const e = new Expense(req.body);
    await e.save();
    res.status(201).json(e);
  } catch (err) {
    next(err);
  }
});

export default r;
