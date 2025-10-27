import { Router } from "express";
import { registerCustomerSubscription, unregisterSubscription, isPushConfigured } from "../lib/push.js";
import { requireCustomer } from "../middleware/auth.js";

const router = Router();

router.post("/subscribe", requireCustomer, async (req, res, next) => {
  try {
    if (!isPushConfigured()) {
      return res.status(503).json({ message: "Push messaging is not configured." });
    }

    const { subscription, meta } = req.body || {};
    if (
      !subscription ||
      !subscription.endpoint ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return res.status(400).json({ message: "Invalid push subscription." });
    }

    await registerCustomerSubscription(req.customerId, {
      subscription,
      meta,
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/unsubscribe", requireCustomer, async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ message: "Endpoint is required." });
    }
    await unregisterSubscription(endpoint);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
