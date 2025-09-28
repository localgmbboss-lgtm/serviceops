// server/src/models/Vendor.js
import mongoose from "mongoose";

const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passHash: { type: String, default: null },

    city: { type: String, trim: true },
    services: [{ type: String, trim: true }], // e.g. ["towing service","jumpstart","heavy duty"]
    heavyDuty: { type: Boolean, default: false },
    radiusKm: { type: Number, default: 25 },
    baseAddress: { type: String, trim: true },

    lat: { type: Number }, // optional for geo filtering
    lng: { type: Number },

    active: { type: Boolean, default: true },

    billing: {
      provider: { type: String, trim: true },
      customerId: { type: String, trim: true },
      defaultPaymentMethodId: { type: String, trim: true },
      cardBrand: { type: String, trim: true },
      cardLast4: { type: String, trim: true },
      updatedAt: { type: Date },
    },

    tosAcceptedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", VendorSchema);


