const mongoose = require("mongoose");

const APPLICATION_STATUS = [
  "pending",
  "applying",
  "applied",
  "failed",
  "retrying",
  "rejected",
];

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: APPLICATION_STATUS,
      default: "pending",
      index: true,
    },
    channel: {
      type: String,
      enum: ["auto", "manual_telegram", "manual_api"],
      default: "auto",
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: { type: String },
    appliedAt: Date,
    metadata: { type: mongoose.Schema.Types.Mixed },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
  },
  { timestamps: true }
);

applicationSchema.index({ jobId: 1 }, { unique: true });

const Application = mongoose.model("Application", applicationSchema);
Application.APPLICATION_STATUS = APPLICATION_STATUS;

module.exports = Application;
