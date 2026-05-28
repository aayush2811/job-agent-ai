const http = require("http");
const app = require("./app");
const startup = require("./utils/startupLogger");
const {
  connectDB,
  disconnectDB,
  isMongoConnected,
  scheduleMongoReconnect,
  stopMongoReconnect,
} = require("./database/db");
const { initSocketIO, closeSocketIO } = require("./sockets");
const whatsappService = require("./modules/whatsapp/whatsapp.service");
const { startTelegram, stopTelegram } = require("./telegram/bot");
const { isTelegramEnabled } = require("./telegram/config");
const { sendStartupNotification } = require("./utils/errorNotifier");
const jobService = require("./jobs/job.service");

/** @type {import('http').Server | null} */
let httpServer = null;
let isShuttingDown = false;

async function onMongoReady() {
  if (!isMongoConnected()) return;
  startup.log("mongo_connected");
  try {
    await jobService.migrateLegacyJobStatuses();
    whatsappService.markMongoReady();
    startup.log("whatsapp_initializing");
    whatsappService.startSafe();
  } catch (err) {
    console.error("[Boot] mongo ready hook failed:", err?.message || err);
  }
}

async function startHttpServer() {
  const PORT = parseInt(process.env.PORT || "5000", 10);

  httpServer = http.createServer(app);

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    const host = process.env.BIND_HOST || "0.0.0.0";
    httpServer.listen(PORT, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  httpServer.timeout = Number(process.env.HTTP_SERVER_TIMEOUT_MS || 60000) || 60000;
  httpServer.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000) || 65000;

  startup.log("express_started", { port: PORT, host: process.env.BIND_HOST || "0.0.0.0" });
  return PORT;
}

async function bootstrap() {
  startup.log("boot_start");

  const port = await startHttpServer();

  const { getAllowedOrigins } = require("./config/cors");
  initSocketIO(httpServer);
  startup.log("socket_started", {
    origins: getAllowedOrigins(),
    heartbeatMs: process.env.SOCKET_HEARTBEAT_MS || "5000",
  });

  whatsappService.markServerReady();

  const mongoOk = await connectDB();
  if (mongoOk) {
    await onMongoReady();
  } else {
    startup.log("mongo_failed_degraded");
    scheduleMongoReconnect(onMongoReady);
  }

  if (isTelegramEnabled()) {
    try {
      const instance = startTelegram();
      const { getTelegramState } = require("./telegram/bot");
      const { hasTelegramCredentials } = require("./telegram/config");
      startup.log("telegram_start_requested", {
        credentials: hasTelegramCredentials(),
        botCreated: Boolean(instance),
      });
      setTimeout(() => {
        const st = getTelegramState();
        startup.log("telegram_status", {
          status: st.status,
          isPolling: st.isPolling,
          chatConnected: st.chatConnected,
          botUsername: st.botUsername,
          lastError: st.lastError,
        });
      }, 2500);
      sendStartupNotification().catch(() => {});
    } catch (err) {
      console.warn("[Boot] Telegram init non-fatal:", err?.message || err);
      startup.log("telegram_start_failed", { error: err?.message || String(err) });
    }
  } else {
    startup.log("telegram_disabled");
  }

  if (!mongoOk) {
    startup.log("whatsapp_deferred_until_mongo");
  }

  startup.log("boot_complete", { port });
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  startup.log("shutdown_start", { signal });

  stopMongoReconnect();

  try {
    await stopTelegram();
  } catch (err) {
    console.warn("[Shutdown] Telegram:", err?.message);
  }

  try {
    await whatsappService.shutdown();
  } catch (err) {
    console.warn("[Shutdown] WhatsApp:", err?.message);
  }

  try {
    await closeSocketIO();
  } catch (err) {
    console.warn("[Shutdown] Socket:", err?.message);
  }

  try {
    await disconnectDB();
  } catch (err) {
    console.warn("[Shutdown] Mongo:", err?.message);
  }

  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  startup.log("shutdown_complete", { signal });
}

function registerShutdownHandlers() {
  const handler = (signal) => {
    gracefulShutdown(signal)
      .catch((err) => console.error("[Shutdown] error:", err?.message))
      .finally(() => process.exit(0));
  };

  process.once("SIGINT", () => handler("SIGINT"));
  process.once("SIGTERM", () => handler("SIGTERM"));
}

module.exports = {
  bootstrap,
  gracefulShutdown,
  registerShutdownHandlers,
  getHttpServer: () => httpServer,
};
