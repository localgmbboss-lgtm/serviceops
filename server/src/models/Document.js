import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["driver", "company", "vendor"], required: true },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    }, // for ownerType=driver
    title: { type: String, required: true }, // "Driver License"
    kind: { type: String, required: true }, // "license", "insurance", "id"
    url: { type: String, required: true }, // link to file (no upload deps)
    status: {
      type: String,
      enum: ["pending", "verified", "expired"],
      default: "pending",
    },
    expiresAt: { type: Date, default: null },

    ownerType: {
      type: String,
      enum: ["driver", "company", "vendor"],
      required: true,
    },

    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },

    notes: { type: String, default: "" },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export default mongoose.model("Document", DocumentSchema);
