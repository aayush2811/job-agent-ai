const { recordSuspiciousProbe } = require("./suspiciousProbe");

/**
 * Block all direct /uploads access — resumes served via authenticated API only.
 */
function uploadsAccessGuard(req, res, next) {
  const url = req.originalUrl || req.url || "";
  if (!url.startsWith("/uploads")) return next();

  recordSuspiciousProbe(req, { reason: "uploads_forbidden", path: url });
  return res.status(404).json({ success: false, message: "Not found", data: null });
}

module.exports = { uploadsAccessGuard };
