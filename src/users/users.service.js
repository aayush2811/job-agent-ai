const User = require("./user.model");
const Resume = require("../resumes/resume.model");
const { getTelegramState } = require("../telegram/bot");
const whatsappService = require("../modules/whatsapp/whatsapp.service");
const { limitsForPlan } = require("./usageLimits");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function updateProfile(userId, updates) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, "User not found");

  if (updates.name) user.name = String(updates.name).trim().slice(0, 120);
  await user.save();
  return user;
}

async function updateOnboarding(userId, patch) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, "User not found");

  user.onboarding = user.onboarding || {};
  const allowed = [
    "resumeUploaded",
    "whatsappConnected",
    "telegramConnected",
    "automationEnabled",
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      user.onboarding[key] = Boolean(patch[key]);
    }
  }

  const resumeCount = await Resume.countDocuments({ userId, isActive: true });
  if (resumeCount > 0) user.onboarding.resumeUploaded = true;

  try {
    const wa = whatsappService.getPublicState?.() || {};
    if (wa.status === "connected") user.onboarding.whatsappConnected = true;
  } catch {
    /* optional */
  }

  try {
    const tg = getTelegramState();
    if (tg.enabled && tg.hasBot) user.onboarding.telegramConnected = true;
  } catch {
    /* optional */
  }

  user.onboardingComplete =
    user.onboarding.resumeUploaded &&
    user.onboarding.whatsappConnected &&
    user.onboarding.telegramConnected &&
    user.onboarding.automationEnabled;

  await user.save();
  return user;
}

async function completeOnboarding(userId) {
  return updateOnboarding(userId, { automationEnabled: true });
}

async function getSettings(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw httpError(404, "User not found");

  let whatsapp = { status: "unavailable" };
  let telegram = { status: "disabled" };
  try {
    whatsapp = whatsappService.getPublicState();
  } catch {
    /* global WA */
  }
  try {
    telegram = getTelegramState();
  } catch {
    /* optional */
  }

  const resumeCount = await Resume.countDocuments({ userId, isActive: true });

  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      onboardingComplete: user.onboardingComplete,
      onboarding: user.onboarding,
      usage: user.usage,
    },
    integrations: { whatsapp, telegram },
    stats: { resumeCount },
    limits: limitsForPlan(user.plan),
  };
}

module.exports = {
  updateProfile,
  updateOnboarding,
  completeOnboarding,
  getSettings,
};
