const logger = require("../utils/logger");
const { getClientIp } = require("./clientIp");

/** In-memory probe counter per IP (resets on process restart) */
const probeCounts = new Map();
const PROBE_LOG_INTERVAL_MS = parseInt(
  process.env.SECURITY_PROBE_LOG_INTERVAL_MS || "60000",
  10
);
const lastLoggedAt = new Map();

function recordSuspiciousProbe(req, meta) {
  const ip = getClientIp(req);
  const key = ip;
  const entry = probeCounts.get(key) || { count: 0, firstAt: Date.now() };
  entry.count += 1;
  entry.lastAt = Date.now();
  entry.lastReason = meta.reason;
  entry.lastPath = meta.path;
  probeCounts.set(key, entry);

  const now = Date.now();
  const lastLog = lastLoggedAt.get(key) || 0;
  const shouldLog =
    entry.count === 1 ||
    now - lastLog >= PROBE_LOG_INTERVAL_MS ||
    entry.count % 25 === 0;

  if (!shouldLog) return;

  lastLoggedAt.set(key, now);
  logger.warn("Security", "suspicious probe blocked", {
    ip,
    method: req.method,
    path: meta.path,
    reason: meta.reason,
    userAgent: req.get?.("user-agent") || req.headers?.["user-agent"],
    probeCount: entry.count,
  });
}

function getProbeStats() {
  return {
    trackedIps: probeCounts.size,
    topProbes: [...probeCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([ip, v]) => ({ ip, count: v.count, lastReason: v.lastReason })),
  };
}

module.exports = { recordSuspiciousProbe, getProbeStats };
