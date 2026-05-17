const whatsappService = require("./whatsapp.service");
const { whatsappSocket, emitWhatsappStatus, emitQrUpdated } = require("./whatsapp.socket");

module.exports = {
  whatsappService,
  whatsappSocket,
  emitWhatsappStatus,
  emitQrUpdated,
};
