const crypto = require("crypto");
const User = require("../users/user.model");
const RefreshToken = require("./refreshToken.model");
const { hashPassword, verifyPassword } = require("./password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("./jwt");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sanitizeUser(user) {
  const o = user.toObject ? user.toObject() : { ...user };
  delete o.password;
  return {
    id: String(o._id),
    name: o.name,
    email: o.email,
    role: o.role,
    plan: o.plan,
    onboardingComplete: o.onboardingComplete,
    onboarding: o.onboarding,
    usage: o.usage,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function storeRefreshToken(userId, refreshToken, userAgent = "") {
  const decoded = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
    userAgent: String(userAgent).slice(0, 500),
  });
}

async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function signup({ name, email, password }) {
  if (!name || !email || !password) {
    throw httpError(400, "Name, email, and password are required");
  }
  if (String(password).length < 8) {
    throw httpError(400, "Password must be at least 8 characters");
  }

  const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existing) throw httpError(409, "Email already registered");

  const isFirstUser = (await User.countDocuments()) === 0;
  const user = await User.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    password: await hashPassword(password),
    role: isFirstUser ? "admin" : "user",
    plan: "free",
    onboardingComplete: false,
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await storeRefreshToken(user._id, refreshToken);

  return { user: sanitizeUser(user), accessToken, refreshToken };
}

async function login({ email, password }, userAgent = "") {
  if (!email || !password) throw httpError(400, "Email and password are required");

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    "+password"
  );
  if (!user || !user.isActive) throw httpError(401, "Invalid email or password");

  const ok = await verifyPassword(password, user.password);
  if (!ok) throw httpError(401, "Invalid email or password");

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await storeRefreshToken(user._id, refreshToken, userAgent);

  return { user: sanitizeUser(user), accessToken, refreshToken };
}

async function refresh(refreshToken) {
  if (!refreshToken) throw httpError(401, "Refresh token required");

  const payload = verifyRefreshToken(refreshToken);
  const stored = await RefreshToken.findOne({
    tokenHash: hashToken(refreshToken),
    revokedAt: null,
    userId: payload.sub,
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw httpError(401, "Refresh token invalid or expired");
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw httpError(401, "User not found");

  await revokeRefreshToken(refreshToken);

  const accessToken = signAccessToken(user);
  const newRefresh = signRefreshToken(user);
  await storeRefreshToken(user._id, newRefresh);

  return { user: sanitizeUser(user), accessToken, refreshToken: newRefresh };
}

async function logout(refreshToken) {
  await revokeRefreshToken(refreshToken);
  return { ok: true };
}

async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, "User not found");
  return sanitizeUser(user);
}

async function demoLogin(userAgent = "") {
  if (process.env.NODE_ENV === "production") {
    throw httpError(403, "Demo mode is disabled in production");
  }

  const email = "demo@jobagent.ai";
  let user = await User.findOne({ email });

  if (!user) {
    const randomPassword = crypto.randomBytes(16).toString("hex");
    user = await User.create({
      name: "Demo User",
      email,
      password: await hashPassword(randomPassword),
      role: "admin",
      plan: "enterprise",
      onboardingComplete: true,
      onboarding: {
        resumeUploaded: true,
        whatsappConnected: true,
        telegramConnected: true,
        automationEnabled: true,
      },
    });
  } else {
    user.role = "admin";
    user.plan = "enterprise";
    user.onboardingComplete = true;
    if (!user.onboarding) {
      user.onboarding = {
        resumeUploaded: true,
        whatsappConnected: true,
        telegramConnected: true,
        automationEnabled: true,
      };
    }
    await user.save();
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await storeRefreshToken(user._id, refreshToken, userAgent);

  return { user: sanitizeUser(user), accessToken, refreshToken };
}

module.exports = {
  signup,
  login,
  refresh,
  logout,
  getMe,
  demoLogin,
  sanitizeUser,
};
