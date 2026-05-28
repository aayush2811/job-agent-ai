const { EventEmitter } = require("events");
const { resolvePipelineUserId } = require("../../users/pipelineOwner");

/**
 * Internal event bus for WhatsApp state (Socket.IO can subscribe later).
 * Events: qr-updated, whatsapp-status, whatsapp-ready, whatsapp-authenticated
 */
const whatsappSocket = new EventEmitter();
whatsappSocket.setMaxListeners(20);

async function withPipelineOwner(payload = {}) {
  if (payload.userId) return payload;
  const userId = await resolvePipelineUserId();
  return userId ? { ...payload, userId: String(userId) } : payload;
}

async function emitWhatsappStatus(payload) {
  whatsappSocket.emit("whatsapp-status", await withPipelineOwner(payload));
}

async function emitQrUpdated(payload) {
  whatsappSocket.emit("qr-updated", await withPipelineOwner(payload));
}

module.exports = {
  whatsappSocket,
  emitWhatsappStatus,
  emitQrUpdated,
};
