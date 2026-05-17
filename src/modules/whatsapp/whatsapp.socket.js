const { EventEmitter } = require("events");

/**
 * Internal event bus for WhatsApp state (Socket.IO can subscribe later).
 * Events: qr-updated, whatsapp-status, whatsapp-ready, whatsapp-authenticated
 */
const whatsappSocket = new EventEmitter();
whatsappSocket.setMaxListeners(20);

function emitWhatsappStatus(payload) {
  whatsappSocket.emit("whatsapp-status", payload);
}

function emitQrUpdated(payload) {
  whatsappSocket.emit("qr-updated", payload);
}

module.exports = {
  whatsappSocket,
  emitWhatsappStatus,
  emitQrUpdated,
};
