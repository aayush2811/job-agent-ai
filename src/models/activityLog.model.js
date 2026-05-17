const mongoose = require("mongoose");

const SEVERITY = ["info", "warn", "error"];

const activityLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
    },
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    severity: {
      type: String,
      enum: SEVERITY,
      default: "info",
    },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ type: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

module.exports = ActivityLog;
