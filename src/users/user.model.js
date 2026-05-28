const mongoose = require("mongoose");

const PLANS = ["free", "pro", "enterprise"];
const ROLES = ["user", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "user" },
    plan: { type: String, enum: PLANS, default: "free" },
    onboardingComplete: { type: Boolean, default: false },
    onboarding: {
      resumeUploaded: { type: Boolean, default: false },
      whatsappConnected: { type: Boolean, default: false },
      telegramConnected: { type: Boolean, default: false },
      automationEnabled: { type: Boolean, default: false },
    },
    usage: {
      resumesCount: { type: Number, default: 0 },
      jobsToday: { type: Number, default: 0 },
      uploadsToday: { type: Number, default: 0 },
      lastResetDay: { type: String, default: "" },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const o = this.toObject();
  delete o.password;
  return o;
};

const User = mongoose.model("User", userSchema);
User.PLANS = PLANS;
User.ROLES = ROLES;

module.exports = User;
