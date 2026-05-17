const { sendErrorAlert } = require("./errorNotifier");

const ALERT_COOLDOWN_MS = 60_000;
let lastUncaughtAt = 0;
let lastRejectionAt = 0;

function formatReason(reason) {
  if (reason instanceof Error) return reason.stack || reason.message;
  return String(reason);
}

/**
 * Keep the HTTP/Socket process alive; log and alert only.
 */
function registerProcessHandlers() {
  if (global.__JOB_AGENT_PROCESS_HANDLERS__) return;
  global.__JOB_AGENT_PROCESS_HANDLERS__ = true;

  process.on("unhandledRejection", (reason) => {
    console.error("[Process] unhandledRejection:", formatReason(reason));
    const now = Date.now();
    if (now - lastRejectionAt > ALERT_COOLDOWN_MS) {
      lastRejectionAt = now;
      sendErrorAlert("Unhandled Promise Rejection", reason).catch(() => {});
    }
  });

  process.on("uncaughtException", (error) => {
    console.error("[Process] uncaughtException:", formatReason(error));
    const now = Date.now();
    if (now - lastUncaughtAt > ALERT_COOLDOWN_MS) {
      lastUncaughtAt = now;
      sendErrorAlert("Uncaught Exception", error).catch(() => {});
    }
  });

  process.on("warning", (warning) => {
    console.warn("[Process] warning:", warning?.message || warning);
  });
}

module.exports = { registerProcessHandlers };
