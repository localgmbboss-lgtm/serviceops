import { Router } from "express";
import mongoose from "mongoose";
import KnowledgeBaseArticle from "../models/KnowledgeBaseArticle.js";

const router = Router();

const audiences = new Set(["admin", "dispatcher", "vendor", "customer", "all"]);
const cannedChannel = new Set(["sms", "email", "push", "in_app"]);

const sanitizeArticlePayload = (payload = {}) => {
  const data = {};
  if (payload.title !== undefined) {
    data.title = String(payload.title || "").trim();
  }
  if (payload.summary !== undefined) {
    data.summary = String(payload.summary || "").trim();
  }
  if (payload.body !== undefined) {
    data.body = String(payload.body || "").trim();
  }
  if (payload.category !== undefined) {
    data.category = String(payload.category || "").trim();
  }
  if (payload.audience && audiences.has(String(payload.audience))) {
    data.audience = String(payload.audience);
  }
  if (Array.isArray(payload.tags)) {
    data.tags = payload.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (payload.isPinned !== undefined) {
    data.isPinned = Boolean(payload.isPinned);
  }
  if (
    Array.isArray(payload.cannedResponses) &&
    payload.cannedResponses.length
  ) {
    data.cannedResponses = payload.cannedResponses
      .map((entry) => ({
        title: String(entry.title || "").trim(),
        body: String(entry.body || "").trim(),
        channel: cannedChannel.has(String(entry.channel))
          ? String(entry.channel)
          : "sms",
      }))
      .filter((entry) => entry.title && entry.body);
  } else if (payload.cannedResponses === null) {
    data.cannedResponses = [];
  }

  if (Array.isArray(payload.attachments)) {
    data.attachments = payload.attachments
      .map((attachment) => ({
        label: String(attachment.label || "").trim(),
        href: String(attachment.href || "").trim(),
      }))
      .filter((attachment) => attachment.href);
  }

  const updatedBy =
    payload.updatedBy && mongoose.isValidObjectId(payload.updatedBy)
      ? new mongoose.Types.ObjectId(payload.updatedBy)
      : null;
  if (updatedBy) {
    data.updatedBy = updatedBy;
  }

  if (payload.lastPublishedAt) {
    const date = new Date(payload.lastPublishedAt);
    if (!Number.isNaN(date.getTime())) {
      data.lastPublishedAt = date;
    }
  }

  return data;
};

router.get("/", async (req, res, next) => {
  try {
    const { audience, search, limit = 200 } = req.query || {};
    const filter = {};
    if (audience && audiences.has(String(audience))) {
      filter.$or = [{ audience: "all" }, { audience: String(audience) }];
    }
    if (search && String(search).trim()) {
      const term = String(search).trim();
      filter.$text = { $search: term };
    }
    const articles = await KnowledgeBaseArticle.find(filter)
      .sort({ isPinned: -1, updatedAt: -1 })
      .limit(Math.min(Number(limit) || 200, 400))
      .lean();
    res.json({ results: articles, count: articles.length });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = sanitizeArticlePayload(req.body || {});
    if (!payload.title || !payload.body) {
      return res
        .status(400)
        .json({ message: "Title and body are required for an article." });
    }
    const article = await KnowledgeBaseArticle.create(payload);
    res.status(201).json(article);
  } catch (error) {
    next(error);
  }
});

router.patch("/:articleId", async (req, res, next) => {
  try {
    const { articleId } = req.params;
    if (!mongoose.isValidObjectId(articleId)) {
      return res.status(400).json({ message: "Invalid article id" });
    }
    const payload = sanitizeArticlePayload(req.body || {});
    if (!Object.keys(payload).length) {
      return res.status(400).json({ message: "No updates supplied" });
    }
    const article = await KnowledgeBaseArticle.findByIdAndUpdate(
      articleId,
      { $set: payload },
      { new: true }
    ).lean();
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }
    res.json(article);
  } catch (error) {
    next(error);
  }
});

router.delete("/:articleId", async (req, res, next) => {
  try {
    const { articleId } = req.params;
    if (!mongoose.isValidObjectId(articleId)) {
      return res.status(400).json({ message: "Invalid article id" });
    }
    await KnowledgeBaseArticle.findByIdAndDelete(articleId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
