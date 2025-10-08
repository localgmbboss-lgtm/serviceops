import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../lib/db.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import Job from "../models/Jobs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readJson = (filename) => {
  const filePath = path.join(__dirname, "data", filename);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const customers = readJson("customers.json");
    const vendors =
      readJson("vendors.json").length > 0
        ? readJson("vendors.json")
        : readJson("drivers.json");

    await Promise.all([
      Customer.deleteMany({}),
      Vendor.deleteMany({}),
      Job.deleteMany({}),
    ]);

    const createdCustomers = await Customer.insertMany(customers);
    const createdVendors = await Vendor.insertMany(
      vendors.map((vendor) => ({
        ...vendor,
        active: true,
        complianceStatus: vendor.complianceStatus || "pending",
      }))
    );

    if (createdCustomers.length && createdVendors.length) {
      await Job.insertMany([
        {
          customerId: createdCustomers[0]._id,
          vendorId: createdVendors[0]._id,
          vendorName: createdVendors[0].name,
          vendorPhone: createdVendors[0].phone,
          status: "Assigned",
          quotedPrice: 15000,
          pickupAddress: "Ikeja City Mall, Lagos",
          serviceType: "delivery",
          notes: "Fragile items",
        },
        {
          customerId: createdCustomers[1]?._id || createdCustomers[0]._id,
          status: "Unassigned",
          quotedPrice: 22000,
          pickupAddress: "Abuja Central Business District",
          serviceType: "installation",
        },
      ]);
    }

    console.log("Seed complete");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
