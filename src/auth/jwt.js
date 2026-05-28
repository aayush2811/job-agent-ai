const jwt = require("jsonwebtoken");

const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "dev-access-secret-change-me";
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "dev-refresh-secret-change-me";
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "7d";

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      plan: user.plan,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: String(user._id), type: "refresh" }, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, REFRESH_SECRET);
  if (payload.type !== "refresh") {
    const err = new Error("Invalid refresh token");
    err.statusCode = 401;
    throw err;
  }
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
