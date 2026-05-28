const { emitToUser } = require("./emitToUser");
const logger = require("../utils/logger");

/**
 * Job ↔ resume match events — owner room only.
 */
function emitMatchEvent(event, payload) {
  const userId = payload?.userId;
  if (!userId) return;
  try {
    emitToUser(userId, event, payload);
    if (process.env.SOCKET_DEBUG === "true") {
      logger.debug("Socket", `emit ${event} job=${payload?.jobId}`);
    }
  } catch (err) {
    logger.error("Socket", `emit ${event} failed`, err?.message || err);
  }
}

module.exports = { emitMatchEvent };
