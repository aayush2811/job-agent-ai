const { verifyAccessToken } = require("./jwt");
const User = require("../users/user.model");

function extractBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token.trim();
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: null,
      });
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
        data: null,
      });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
      plan: user.plan,
      onboardingComplete: user.onboardingComplete,
    };
    req.auth = payload;
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message || "Invalid token",
      data: null,
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
        data: null,
      });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, extractBearer };
