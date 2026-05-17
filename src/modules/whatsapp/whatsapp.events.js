const qrcode = require("qrcode-terminal");
const extractJobData = require("../../ai/regexExtractor");
const isJobRelated = require("../../utils/jobFilter");
const { sendErrorAlert } = require("../../utils/errorNotifier");
const startup = require("../../utils/startupLogger");
const syncOldMessages = require("../../whatsapp/syncOldMessages");
const { emitWhatsappStatus, emitQrUpdated } = require("./whatsapp.socket");
const jobPipeline = require("../../services/jobPipeline.service");

const SYNC_DELAY_MS = 10_000;

/**
 * Attach WhatsApp client listeners once per client instance.
 * @param {import('whatsapp-web.js').Client} client
 * @param {import('./whatsapp.service')} service
 */
function bindWhatsappEvents(client, service) {
  if (client.__jobAgentEventsBound) {
    return;
  }
  client.__jobAgentEventsBound = true;

  client.on("change_state", (state) => {
    service.log("info", "change_state", { state });
    service.setStatus(state === "CONNECTED" ? "connected" : String(state).toLowerCase());
  });

  client.on("loading_screen", (percent, message) => {
    service.setStatus("loading");
    service.log("info", "loading_screen", { percent, message });
    emitWhatsappStatus(service.getPublicState());
  });

  client.on("qr", (qr) => {
    service.latestQr = qr;
    service.setStatus("qr");
    service.log("info", "qr", { message: "Scan QR to authenticate" });
    emitQrUpdated({ qr, at: new Date().toISOString() });
    emitWhatsappStatus(service.getPublicState());
    try {
      qrcode.generate(qr, { small: true });
    } catch (e) {
      service.log("warn", "qr_terminal", { error: e?.message });
    }
  });

  client.on("authenticated", () => {
    service.isAuthenticated = true;
    service.log("info", "authenticated");
    emitWhatsappStatus(service.getPublicState());
  });

  client.on("ready", () => {
    service.isReady = true;
    service.isAuthenticated = true;
    service.reconnectAttempts = 0;
    const isReconnect = Boolean(service._wasReconnect);
    service.hadConnectedOnce = true;
    service.setStatus("connected");
    service.log("info", isReconnect ? "ready_reconnect" : "ready", {
      reconnect: isReconnect,
    });
    service._wasReconnect = false;
    startup.log("whatsapp_ready");
    emitWhatsappStatus(service.getPublicState());

    if (service._syncTimer) {
      clearTimeout(service._syncTimer);
    }
    service._syncTimer = setTimeout(() => {
      syncOldMessages(client).catch((err) => {
        service.log("error", "sync_old_messages", { error: err?.message });
      });
    }, SYNC_DELAY_MS);
  });

  client.on("auth_failure", (msg) => {
    service.isReady = false;
    service.isAuthenticated = false;
    service.setStatus("auth_failure");
    service.log("error", "auth_failure", { msg });
    emitWhatsappStatus(service.getPublicState());
    sendErrorAlert("WhatsApp Auth Failure", msg).catch(() => {});
  });

  client.on("disconnected", (reason) => {
    service.isReady = false;
    service.setStatus("disconnected");
    service.log("warn", "disconnected", { reason });
    emitWhatsappStatus(service.getPublicState());
    sendErrorAlert("WhatsApp Disconnected", reason).catch(() => {});

    if (!service.shuttingDown && !service._destroying) {
      service.scheduleReconnect(String(reason || "disconnected"));
    }
  });

  client.on("message_create", async (message) => {
    try {
      const text = message.body;
      const messageId = message.id?._serialized;
      if (!text || !messageId) return;

      service.log("debug", "message_create", {
        from: message.from,
        fromMe: message.fromMe,
      });

      if (!isJobRelated(text)) return;

      const extractedData = await extractJobData(text);
      const result = await jobPipeline.processFromExtraction({
        messageId,
        text,
        extractedData,
        source: "whatsapp",
      });

      if (!result.ok) {
        service.log("debug", "pipeline_result", {
          reason: result.reason,
          score: result.score,
        });
      }
    } catch (error) {
      service.log("error", "message_processing", { error: error?.message });
      await sendErrorAlert("WhatsApp Message Processing", error);
    }
  });
}

module.exports = { bindWhatsappEvents };
