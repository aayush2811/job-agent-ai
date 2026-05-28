const { classifyBlockedRequest } = require("./blockedPaths");
const { recordSuspiciousProbe } = require("./suspiciousProbe");

/**
 * Lightweight firewall: blocked paths, traversal, scanner signatures.
 * Returns generic 404 to avoid confirming asset existence.
 */
function pathFirewall(req, res, next) {
  const result = classifyBlockedRequest(req);
  if (!result.blocked) return next();

  recordSuspiciousProbe(req, {
    reason: result.reason,
    path: result.path,
  });

  return res.status(404).json({
    success: false,
    message: "Not found",
    data: null,
  });
}

module.exports = pathFirewall;
