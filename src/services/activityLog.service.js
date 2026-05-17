const ActivityLog = require("../models/activityLog.model");
const { isDbReady } = require("../utils/dbGuard");

async function logActivity({
  type,
  message,
  jobId = null,
  applicationId = null,
  meta = null,
  severity = "info",
}) {
  if (!isDbReady()) {
    console.log(`[Activity] ${type}: ${message}`, meta || "");
    return null;
  }
  try {
    return await ActivityLog.create({
      type,
      message,
      jobId,
      applicationId,
      meta,
      severity,
    });
  } catch (err) {
    console.error("[Activity] persist failed:", err?.message);
    return null;
  }
}

module.exports = { logActivity };
