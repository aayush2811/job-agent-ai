const mongoose = require("mongoose");

const JOB_STATUS = [
  "pending",
  "approved",
  "auto_applied",
  "rejected",
  "failed",
];

const jobSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      unique: true,
    },

    text: {
      type: String,
      required: true,
    },

    company: String,

    role: String,

    experience: String,

    location: String,

    email: String,

    skills: [String],

    applied: {
      type: Boolean,
      default: false,
    },

    emailSent: {
      type: Boolean,
      default: false,
    },

    appliedAt: {
      type: Date,
    },

    matchScore: {
      type: Number,
      default: 0,
    },

    /** Deterministic resume ↔ job match (0–100) */
    resumeMatchScore: {
      type: Number,
      default: 0,
    },

    recommendedResumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      default: null,
    },

    matchedSkills: {
      type: [String],
      default: [],
    },

    missingSkills: {
      type: [String],
      default: [],
    },

    confidence: {
      type: Number,
      default: 0,
    },

    experienceMatch: {
      type: String,
      default: "",
    },

    scoreBreakdown: mongoose.Schema.Types.Mixed,

    scoreRecommendation: String,

    scoringReasoning: [String],

    approvalTimedOut: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: JOB_STATUS,
      default: "pending",
    },

    source: {
      type: String,
      default: "WhatsApp",
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Job = mongoose.model("Job", jobSchema);
Job.JOB_STATUS = JOB_STATUS;

module.exports = Job;
