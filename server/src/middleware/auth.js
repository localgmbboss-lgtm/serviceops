// server/src/middleware/auth.js
import jwt from "jsonwebtoken";

export function requireCustomer(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: "No token" });
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (payload.role !== "customer")
      return res.status(403).json({ message: "Forbidden" });
    req.customerId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
