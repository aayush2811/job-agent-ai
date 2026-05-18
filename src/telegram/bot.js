const { sendWarningAlert } = require("../utils/errorNotifier");
const { isTelegramEnabled, hasTelegramCredentials } = require("./config");

/** @type {import('node-telegram-bot-api') | null} */
let bot = null;
let handlersBound = false;
let isPolling = false;
let startInProgress = false;
let isShuttingDown = false;
let pollingRetryTimer = null;
let pollingBackoffAttempt = 0;

const BASE_POLLING_BACKOFF_MS = 2000;
const MAX_POLLING_BACKOFF_MS = 5 * 60 * 1000;

const telegramState = {
  status: "disabled",
  enabled: false,
  lastError: null,
};

let lastPollingLogAt = 0;
const POLLING_LOG_THROTTLE_MS = 30_000;

function getTelegramState() {
  return {
    ...telegramState,
    isPolling,
    pollingBackoffAttempt,
    hasBot: Boolean(bot),
  };
}

function getBot() {
  return bot;
}

function clearPollingRetry() {
  if (pollingRetryTimer) {
    clearTimeout(pollingRetryTimer);
    pollingRetryTimer = null;
  }
}

function logPollingErrorThrottled(message) {
  const now = Date.now();
  if (now - lastPollingLogAt < POLLING_LOG_THROTTLE_MS) return;
  lastPollingLogAt = now;
  console.error("[Telegram] polling_error:", message);
}

function getPollingBackoffDelay() {
  const exp = BASE_POLLING_BACKOFF_MS * Math.pow(2, pollingBackoffAttempt);
  pollingBackoffAttempt += 1;
  return Math.min(exp, MAX_POLLING_BACKOFF_MS);
}

function botReportsPolling(instance) {
  return typeof instance.isPolling === "function" && instance.isPolling();
}

async function stopPollingSafely() {
  if (!bot || !isPolling) return;
  try {
    await bot.stopPolling({ cancel: true });
  } catch (err) {
    console.warn("[Telegram] stopPolling:", err?.message || err);
  }
  isPolling = false;
}

function schedulePollingRestart() {
  if (isShuttingDown || !isTelegramEnabled() || !bot) return;
  if (pollingRetryTimer) return;

  const delay = getPollingBackoffDelay();
  telegramState.status = "reconnecting";
  console.warn(`[Telegram] polling restart scheduled in ${delay}ms`);

  pollingRetryTimer = setTimeout(() => {
    pollingRetryTimer = null;
    startPollingOnce().catch((err) => {
      console.error("[Telegram] polling restart failed:", err?.message || err);
      schedulePollingRestart();
    });
  }, delay);
}

function startPollingOnce() {
  if (!bot || isShuttingDown || isPolling) return Promise.resolve();
  if (startInProgress) return Promise.resolve();
  if (botReportsPolling(bot)) {
    isPolling = true;
    telegramState.status = "running";
    return Promise.resolve();
  }

  startInProgress = true;
  try {
    bot.startPolling({ restart: false });
    isPolling = true;
    pollingBackoffAttempt = 0;
    telegramState.status = "running";
    telegramState.lastError = null;
    console.log("[Telegram] polling started");
  } catch (err) {
    isPolling = false;
    telegramState.status = "error";
    telegramState.lastError = err?.message || String(err);
    console.error("[Telegram] startPolling failed:", telegramState.lastError);
    schedulePollingRestart();
  } finally {
    startInProgress = false;
  }
  return Promise.resolve();
}

function bindHandlers(instance) {
  if (handlersBound) return;
  handlersBound = true;

  const jobService = require("../jobs/job.service");

  instance.on("polling_error", (err) => {
    const msg = err?.message || String(err);
    telegramState.lastError = msg;
    telegramState.status = "error";
    logPollingErrorThrottled(msg);

    stopPollingSafely()
      .then(() => schedulePollingRestart())
      .catch(() => schedulePollingRestart());
  });

  instance.on("callback_query", async (query) => {
    try {
      const data = query.data;
      const chatId = query.message.chat.id;
      const [action, jobId] = data.split("_");

      if (action === "approve") {
        try {
          const job = await jobService.approveJob(jobId, { channel: "telegram" });
          await instance.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: "✅ APPROVED", callback_data: "approved" }]] },
            { chat_id: query.message.chat.id, message_id: query.message.message_id }
          );
          await instance.sendMessage(chatId, `✅ Approved Application for ${job.role}`);
          await instance.answerCallbackQuery(query.id);
        } catch (e) {
          const code = e.statusCode;
          if (code === 404) {
            await instance.answerCallbackQuery(query.id, { text: "Job not found" });
            return;
          }
          if (code === 409) {
            await instance.answerCallbackQuery(query.id, { text: e.message });
            return;
          }
          if (code === 502) {
            await instance.answerCallbackQuery(query.id, {
              text: "❌ Email failed — see alerts",
            });
            return;
          }
          throw e;
        }
        return;
      }

      if (action === "reject") {
        try {
          const job = await jobService.rejectJob(jobId);
          await instance.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: "❌ REJECTED", callback_data: "rejected" }]] },
            { chat_id: query.message.chat.id, message_id: query.message.message_id }
          );
          await instance.sendMessage(chatId, `❌ Rejected ${job.role}`);
          await instance.answerCallbackQuery(query.id);
        } catch (e) {
          const code = e.statusCode;
          if (code === 404) {
            await instance.answerCallbackQuery(query.id, { text: "Job not found" });
            return;
          }
          if (code === 409) {
            await instance.answerCallbackQuery(query.id, { text: e.message });
            return;
          }
          throw e;
        }
        return;
      }

      await instance.answerCallbackQuery(query.id);
    } catch (error) {
      console.error("[Telegram] callback error:", error?.message || error);
      sendWarningAlert("Telegram Approval Callback", error).catch(() => {});
    }
  });
}

/**
 * Starts the Telegram bot singleton. Never throws; failures are logged only.
 * @returns {import('node-telegram-bot-api') | null}
 */
function startTelegram() {
  telegramState.enabled = isTelegramEnabled();

  if (!isTelegramEnabled()) {
    telegramState.status = "disabled";
    return null;
  }

  if (bot) {
    if (!isPolling && !isShuttingDown) {
      startPollingOnce().catch(() => {});
    }
    return bot;
  }

  if (startInProgress) return bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramState.status = "disabled";
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN missing — bot not started");
    return null;
  }

  startInProgress = true;
  try {
    const TelegramBot = require("node-telegram-bot-api");
    bot = new TelegramBot(token, { polling: false });
    bindHandlers(bot);
    startPollingOnce().catch(() => {});
    return bot;
  } catch (err) {
    telegramState.status = "error";
    telegramState.lastError = err?.message || String(err);
    console.error("[Telegram] start failed:", telegramState.lastError);
    bot = null;
    isPolling = false;
    return null;
  } finally {
    startInProgress = false;
  }
}

async function stopTelegram() {
  isShuttingDown = true;
  clearPollingRetry();

  if (!bot) {
    telegramState.status = isTelegramEnabled() ? "stopped" : "disabled";
    isPolling = false;
    return;
  }

  await stopPollingSafely();
  bot = null;
  handlersBound = false;
  pollingBackoffAttempt = 0;
  isPolling = false;
  telegramState.status = "stopped";
}

const sendJobNotification = async (job) => {
  if (!isTelegramEnabled() || !hasTelegramCredentials()) return;
  const instance = getBot();
  if (!instance || !isPolling) return;

  try {
    const message = `
🔥 New Job Match

🏢 Company: ${job.company}
💼 Role: ${job.role}
📍 Location: ${job.location}
🎯 Match Score: ${job.matchScore}%
📧 Email: ${job.email}
`;

    await instance.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve_${job._id}` },
            { text: "❌ Reject", callback_data: `reject_${job._id}` },
          ],
        ],
      },
    });
  } catch (error) {
    console.error("[Telegram] job notification error:", error?.message || error);
    sendWarningAlert("Telegram Job Notification Failed", error).catch(() => {});
  }
};

const sendAutoApplyNotification = async (job) => {
  if (!isTelegramEnabled() || !hasTelegramCredentials()) return;
  const instance = getBot();
  if (!instance || !isPolling) return;

  try {
    const message = `
🚀 Auto Applied Successfully

🏢 Company: ${job.company}
💼 Role: ${job.role}
🎯 Match Score: ${job.matchScore}%
`;
    await instance.sendMessage(process.env.TELEGRAM_CHAT_ID, message);
  } catch (error) {
    console.error("[Telegram] auto-apply notify error:", error?.message || error);
    sendWarningAlert("Telegram Auto-Apply Notification Failed", error).catch(() => {});
  }
};

module.exports = {
  startTelegram,
  stopTelegram,
  getBot,
  getTelegramState,
  sendJobNotification,
  sendAutoApplyNotification,
};
