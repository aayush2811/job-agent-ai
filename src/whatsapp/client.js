/**
 * @deprecated Use src/modules/whatsapp/whatsapp.service.js
 * Kept for backward-compatible imports.
 */
const whatsappService = require("../modules/whatsapp/whatsapp.service");

function startWhatsApp() {
  return whatsappService.startSafe();
}

startWhatsApp.getWhatsappStatus = () => whatsappService.getWhatsappStatus();
startWhatsApp.getState = () => whatsappService.getPublicState();
startWhatsApp.shutdown = () => whatsappService.shutdown();

module.exports = startWhatsApp;
