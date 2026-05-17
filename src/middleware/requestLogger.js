const logger = require("../utils/logger");

const SKIP_PREFIXES = ["/health", "/api/health", "/uploads/", "/socket.io"];
const SLOW_MS = parseInt(process.env.LOG_SLOW_REQUEST_MS || "2000", 10);

function shouldSkip(path) {
  return SKIP_PREFIXES.some((p) => path.startsWith(p));
}

function requestLogger(req, res, next) {
  const path = req.originalUrl || req.url || "";

  if (shouldSkip(path)) {
    return next();
  }

  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;

    if (logger.isProduction) {
      if (status >= 500) {
        logger.error("HTTP", `${req.method} ${path} ${status} ${ms}ms`);
      } else if (status >= 400) {
        logger.warn("HTTP", `${req.method} ${path} ${status} ${ms}ms`);
      } else if (ms >= SLOW_MS) {
        logger.warn("HTTP", `slow ${req.method} ${path} ${status} ${ms}ms`);
      }
      return;
    }

    logger.debug("HTTP", `${req.method} ${path} ${status} ${ms}ms`);
  });

  next();
}

module.exports = requestLogger;
