// server/src/models/Customer.js
import mongoose from "mongoose";

const SavedProfileSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    vehicleMake: { type: String, trim: true },
    vehicleModel: { type: String, trim: true },
    vehicleColor: { type: String, trim: true },
    vehiclePlate: { type: String, trim: true },
    notes: { type: String, trim: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CustomerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: {
      type: String,
      trim: true,
      index: true,
      unique: true,
      sparse: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    passHash: { type: String },
    isGuest: { type: Boolean, default: false },
    guestToken: { type: String, sparse: true, index: true },
    lastServiceRequest: { type: Date },
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
    savedProfile: { type: SavedProfileSchema, default: undefined },
    otpCodeHash: { type: String },
    otpExpiresAt: { type: Date },
    otpAttemptCount: { type: Number, default: 0 },
    otpLastSentAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

CustomerSchema.pre("save", function setDefaults(next) {
  if (!this.name && this.savedProfile?.name) {
    this.name = this.savedProfile.name;
  }
  next();
});

export default mongoose.model("Customer", CustomerSchema);
