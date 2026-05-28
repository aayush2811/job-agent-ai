const { emitToUser } = require("./emitToUser");
const logger = require("../utils/logger");

/**
 * Resume lifecycle events — scoped to owner room only.
 */
function emitResumeEvent(event, payload) {
  const userId =
    payload?.userId ||
    payload?.resume?.userId ||
    (typeof payload?.resume?.userId === "object"
      ? String(payload?.resume?.userId)
      : null);
  if (!userId) return;
  try {
    emitToUser(userId, event, payload);
    if (process.env.SOCKET_DEBUG === "true") {
      logger.debug(
        "Socket",
        `emit ${event} id=${payload?.resume?._id || payload?.id || "n/a"}`
      );
    }
  } catch (err) {
    logger.error("Socket", `emit ${event} failed`, err?.message || err);
  }
}

module.exports = { emitResumeEvent };
