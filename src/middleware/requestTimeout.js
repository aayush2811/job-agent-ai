/**
 * Failsafe timeout so handlers never hang indefinitely (returns 503 JSON).
 */
function requestTimeout(ms = 25_000) {
  return (req, res, next) => {
    const timeoutMs = Number(process.env.API_REQUEST_TIMEOUT_MS || ms) || ms;
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      res.status(503).json({
        success: false,
        message: "Request timeout",
        data: null,
      });
    }, timeoutMs);

    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}

module.exports = requestTimeout;
