// server/src/models/Customer.js
import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, trim: true, index: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    passHash: { type: String }, // optional (guest customers won't have it)
    isGuest: { type: Boolean, default: false }, // Flag to identify guest customers
    guestToken: { type: String, sparse: true }, // Unique token for guest customers
    lastServiceRequest: { type: Date }, // Track last service request
    serviceHistory: [
      {
        date: { type: Date, default: Date.now },
        serviceType: String,
        description: String,
        address: String,
        vehicleMake: String,
        vehicleModel: String,
        vehicleColor: String,
      },
    ],
  },
  { timestamps: true }
);

// Index for guest token lookup
CustomerSchema.index({ guestToken: 1 });

export default mongoose.model("Customer", CustomerSchema);
