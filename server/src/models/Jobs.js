import mongoose from "mongoose";

const schedulingConfirmationSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actor: {
      type: String,
      enum: ["customer", "admin", "vendor", "system"],
      default: "system",
    },
    channel: {
      type: String,
      enum: ["email", "sms", "phone", "in_app", "system"],
      default: "system",
    },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const schedulingOptionSchema = new mongoose.Schema(
  {
    start: { type: Date },
    end: { type: Date },
    proposedBy: {
      type: String,
      enum: ["customer", "admin", "vendor", "system"],
      default: "system",
    },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const schedulingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "requested", "confirmed", "rescheduled", "cancelled"],
      default: "none",
    },
    requestedWindowStart: { type: Date },
    requestedWindowEnd: { type: Date },
    confirmedWindowStart: { type: Date },
    confirmedWindowEnd: { type: Date },
    timezone: { type: String, trim: true },
    customerNotes: { type: String, trim: true },
    lastUpdatedBy: {
      type: String,
      enum: ["customer", "admin", "vendor", "system"],
      default: "customer",
    },
    confirmations: {
      type: [schedulingConfirmationSchema],
      default: [],
    },
    options: {
      type: [schedulingOptionSchema],
      default: [],
    },
  },
  { _id: false }
);

const JobSchema = new mongoose.Schema(
  {
    // Core relations
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    guestRequest: { type: Boolean, default: false },

    // Vendor relationship (use this instead of driverId)
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
      index: true,
    },

    // Status flow
    status: {
      type: String,
      enum: ["Unassigned", "Assigned", "OnTheWay", "Arrived", "Completed"],
      default: "Unassigned",
      index: true,
    },

    // Location coordinates
    pickupLat: { type: Number },
    pickupLng: { type: Number },
    dropoffLat: { type: Number },
    dropoffLng: { type: Number },
    shareLive: { type: Boolean, default: false },
    vehiclePinned: { type: Boolean, default: true },

    created: { type: Date, default: Date.now },
    completed: { type: Date },

    // Bidding / public links
    vendorToken: { type: String, default: null },
    customerToken: { type: String, default: null },
    vendorAcceptedToken: { type: String, default: null },
    selectedBidId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bid",
      default: null,
    },
    biddingOpen: { type: Boolean, default: false },
    bidMode: {
      type: String,
      enum: ["open", "fixed"],
      default: "open",
      index: true,
    },


    // Vendor details once selected
    vendorName: { type: String, default: null },
    vendorPhone: { type: String, default: null },
    vendorRating: { type: Number, default: 0 },
    vendorTotalJobs: { type: Number, default: 0 },

    // Business fields
    quotedPrice: { type: Number, default: 0 },
    finalPrice: { type: Number, default: 0 },
    pickupAddress: { type: String, required: true, trim: true },
    dropoffAddress: { type: String, trim: true },
    serviceType: { type: String, trim: true },
    notes: { type: String, trim: true },

    // Vehicle information (from guest form)
    vehicleMake: { type: String, trim: true },
    vehicleModel: { type: String, trim: true },
    vehicleColor: { type: String, trim: true },
    vehicleYear: { type: Number },

    // Service details
    urgency: {
      type: String,
      enum: ["emergency", "urgent", "standard"],
      default: "standard",
    },
    estimatedDuration: { type: String }, // From distance calculation
    estimatedDistance: { type: String }, // From distance calculation

    // Escalation / priority
    priority: { type: String, enum: ["normal", "urgent"], default: "normal" },
    escalatedAt: { type: Date, default: null },

    // Payment status
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "disputed"],
      default: "pending",
    },
    paymentMethod: { type: String },
    paymentDate: { type: Date },

    // Vendor reported payment details (post-completion)
    reportedPayment: {
      amount: { type: Number, default: 0, min: 0 },
      method: {
        type: String,
        enum: [
          null,
          "cash",
          "card",
          "zelle",
          "venmo",
          "bank_transfer",
          "other",
        ],
        default: null,
      },
      reportedAt: { type: Date },
      note: { type: String, trim: true },
      actor: {
        type: String,
        enum: ["vendor", "admin", "system"],
        default: "vendor",
      },
    },

    // Commission tracking for platform share
    commission: {
      rate: { type: Number, default: 0, min: 0, max: 1 },
      amount: { type: Number, default: 0, min: 0 },
      status: {
        type: String,
        enum: ["pending", "charged", "failed", "skipped"],
        default: "pending",
      },
      chargedAt: { type: Date },
      chargeId: { type: String, trim: true },
      failureReason: { type: String, trim: true },
    },

    // Expected vs reported safeguard metadata
    expectedRevenue: { type: Number, default: 0, min: 0 },
    flags: {
      underReport: { type: Boolean, default: false },
      reason: { type: String, trim: true },
    },

    // Rating and feedback
    customerRating: { type: Number, min: 1, max: 5 },
    customerReview: { type: String },
    vendorRating: { type: Number, min: 1, max: 5 },
    vendorFeedback: { type: String },

    // Customer scheduling preferences & confirmations
    scheduling: {
      type: schedulingSchema,
      default: () => ({
        status: "none",
        confirmations: [],
        options: [],
      }),
    },

    // Timestamps for status changes
    assignedAt: { type: Date },
    onTheWayAt: { type: Date },
    arrivedAt: { type: Date },
    completedAt: { type: Date },

    // Cancellation
    cancelled: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    cancellationReason: { type: String },

    // Internal tracking
    internalNotes: { type: String },
    serviceFee: { type: Number, default: 0 }, // Platform fee
  },
  { timestamps: true }
);

// Helpful unique+sparse indexes for tokens (only enforce uniqueness when set)
JobSchema.index({ vendorToken: 1 }, { unique: true, sparse: true });
JobSchema.index({ customerToken: 1 }, { unique: true, sparse: true });
JobSchema.index({ vendorAcceptedToken: 1 }, { unique: true, sparse: true });

// Common queries performance
JobSchema.index({ status: 1, created: -1 });
JobSchema.index({ customerId: 1, created: -1 });
JobSchema.index({ vendorId: 1, created: -1 });
JobSchema.index({ biddingOpen: 1, status: 1 });
JobSchema.index({ bidMode: 1, status: 1 });
JobSchema.index({ serviceType: 1, status: 1 });
JobSchema.index({ priority: 1, status: 1 });
JobSchema.index({ "commission.status": 1, created: -1 });
JobSchema.index({ "flags.underReport": 1, created: -1 });

// Geospatial index for location-based queries
JobSchema.index({ pickupLat: 1, pickupLng: 1 });
JobSchema.index({ dropoffLat: 1, dropoffLng: 1 });

// Text search index for address and notes
JobSchema.index({
  pickupAddress: "text",
  dropoffAddress: "text",
  notes: "text",
  serviceType: "text",
});

// Virtual for job duration
JobSchema.virtual("duration").get(function () {
  if (this.created && this.completed) {
    return this.completed - this.created;
  }
  return null;
});

// Method to check if job is active
JobSchema.methods.isActive = function () {
  return !this.cancelled && this.status !== "Completed";
};

// Method to get status timeline
JobSchema.methods.getTimeline = function () {
  return {
    created: this.created,
    assigned: this.assignedAt,
    onTheWay: this.onTheWayAt,
    arrived: this.arrivedAt,
    completed: this.completedAt,
    cancelled: this.cancelledAt,
  };
};

// Static method to find jobs by status
JobSchema.statics.findByStatus = function (status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

// Static method to find jobs by vendor
JobSchema.statics.findByVendor = function (vendorId) {
  return this.find({ vendorId }).sort({ createdAt: -1 });
};

// Static method to find jobs by customer
JobSchema.statics.findByCustomer = function (customerId) {
  return this.find({ customerId }).sort({ createdAt: -1 });
};

// Pre-save middleware to update timestamps based on status changes
JobSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    const now = new Date();

    switch (this.status) {
      case "Assigned":
        this.assignedAt = this.assignedAt || now;
        break;
      case "OnTheWay":
        this.onTheWayAt = this.onTheWayAt || now;
        break;
      case "Arrived":
        this.arrivedAt = this.arrivedAt || now;
        break;
      case "Completed":
        this.completedAt = this.completedAt || now;
        this.completed = this.completed || now;
        break;
    }
  }
  next();
});

export default mongoose.model("Job", JobSchema);






