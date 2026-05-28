const { getIO } = require("./index");
const logger = require("../utils/logger");

function userRoom(userId) {
  return userId ? `user:${userId}` : null;
}

/**
 * Emit to a single user's room (no global broadcast).
 */
function emitToUser(userId, event, payload) {
  const io = getIO();
  if (!io || !userId) return;
  try {
    const room = userRoom(userId);
    const body = {
      ...payload,
      userId: String(userId),
      at: new Date().toISOString(),
    };
    io.to(room).emit(event, body);
    if (process.env.SOCKET_DEBUG === "true") {
      logger.debug("Socket", `emit ${event} → ${room}`);
    }
  } catch (err) {
    logger.error("Socket", `emitToUser ${event} failed`, err?.message || err);
  }
}

module.exports = { emitToUser, userRoom };
