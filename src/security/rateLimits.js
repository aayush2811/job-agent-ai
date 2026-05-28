const rateLimit = require("express-rate-limit");
const { getClientIp } = require("./clientIp");
const logger = require("../utils/logger");

const isProduction = process.env.NODE_ENV === "production";

function rateLimitHandler(scope) {
  return (req, res, _next, options) => {
    logger.warn("Security", `${scope} rate limit exceeded`, {
      ip: getClientIp(req),
      path: req.originalUrl,
    });
    res.status(options.statusCode).json({
      success: false,
      message: "Too many requests. Please try again later.",
      data: null,
    });
  };
}

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

/** General API abuse protection (mounted at /api) */
const apiRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || "900000", 10),
  max: parseInt(process.env.RATE_LIMIT_API_MAX || (isProduction ? "300" : "1000"), 10),
  handler: rateLimitHandler("API"),
});

/** Auth endpoints (reserved for future routes) */
const authRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || "900000", 10),
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || "20", 10),
  handler: rateLimitHandler("Auth"),
});

/** Resume uploads (POST /api/resumes/upload) */
const uploadRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || "3600000", 10),
  max: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || "30", 10),
  handler: rateLimitHandler("Upload"),
});

/** Socket.IO HTTP transport — only mounted at /socket.io */
const socketHttpRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: parseInt(process.env.RATE_LIMIT_SOCKET_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RATE_LIMIT_SOCKET_MAX || (isProduction ? "120" : "500"), 10),
  handler: rateLimitHandler("Socket.IO"),
});

module.exports = {
  apiRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  socketHttpRateLimiter,
};
