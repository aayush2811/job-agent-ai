/**
 * Resolve client IP (respects Express trust proxy when enabled).
 * @param {import('express').Request | { headers?: Record<string, string>, socket?: { remoteAddress?: string } }} req
 */
function getClientIp(req) {
  if (!req) return "unknown";

  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }

  const realIp = req.headers?.["x-real-ip"];
  if (realIp) return String(realIp).trim();

  return (
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    req.ip ||
    "unknown"
  );
}

module.exports = { getClientIp };
