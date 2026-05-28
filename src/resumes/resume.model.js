const mongoose = require("mongoose");

const UPLOAD_STATUS = ["pending", "processing", "completed", "failed"];

const resumeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    parsedSkills: {
      type: [String],
      default: [],
    },
    parsedExperience: {
      type: String,
      default: "",
    },
    parsedKeywords: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      default: "general",
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    uploadStatus: {
      type: String,
      enum: UPLOAD_STATUS,
      default: "pending",
    },
    parseError: {
      type: String,
      default: null,
    },
    applicationCount: {
      type: Number,
      default: 0,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

resumeSchema.index({ isDefault: 1 });
resumeSchema.index({ isActive: 1, createdAt: -1 });
resumeSchema.index({ tags: 1 });

const Resume = mongoose.model("Resume", resumeSchema);
Resume.UPLOAD_STATUS = UPLOAD_STATUS;

module.exports = Resume;
