const mongoose = require("mongoose");

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

    matchScore: {
      type: Number,
      default: 0,
    },

    source: {
      type: String,
      default: "WhatsApp",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Job", jobSchema);
