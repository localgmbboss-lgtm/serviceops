
// server/src/middleware/ensureVendor.js
import jwt from "jsonwebtoken";
import Vendor from "../models/Vendor.js";
const JWT_SECRET = process.env.JWT_VENDOR_SECRET || "dev_vendor_secret";

export async function ensureVendor(req,res,next){
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if(!token) return res.status(401).json({ message: "No token" });
  try{
    const { v } = jwt.verify(token, JWT_SECRET);
    const vendor = await Vendor.findById(v.id);
    if(!vendor) return res.status(401).json({ message: "Invalid token" });
    req.vendor = vendor;
    next();
  }catch(e){ res.status(401).json({ message: "Invalid token" }); }
}
