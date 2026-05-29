const { sendWarningAlert } = require("../utils/errorNotifier");
const {
  isTelegramEnabled,
  hasTelegramCredentials,
  logTelegramStartupDiagnostics,
} = require("./config");
const { resolveChatForJob, resolveOwnerUserIdForJob, resolveChatIdForUser } = require("./chatResolver");

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
  botUsername: null,
  chatConnected: false,
};

let lastPollingLogAt = 0;
const POLLING_LOG_THROTTLE_MS = 30_000;

function getTelegramState() {
  return {
    ...telegramState,
    enabled: isTelegramEnabled(),
    isPolling,
    pollingBackoffAttempt,
    hasBot: Boolean(bot),
    hasCredentials: hasTelegramCredentials(),
  };
}

function getBot() {
  return bot;
}

function canSendOutbound() {
  return isTelegramEnabled() && hasTelegramCredentials() && Boolean(bot);
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

async function verifyBotConnection(instance) {
  try {
    const me = await instance.getMe();
    telegramState.botUsername = me.username || null;
    console.log(
      `[Telegram] bot initialized @${me.username || "unknown"} (id=${me.id})`
    );

    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      telegramState.chatConnected = true;
      console.log(`[Telegram] chat connected (TELEGRAM_CHAT_ID=${chatId})`);
    } else {
      telegramState.chatConnected = false;
      console.warn("[Telegram] TELEGRAM_CHAT_ID missing — outbound notifications disabled");
    }
  } catch (err) {
    telegramState.chatConnected = false;
    console.error("[Telegram] bot getMe failed:", err?.message || err);
  }
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
    console.log("[Telegram] polling connected — listening for approval callbacks");
    verifyBotConnection(bot).catch(() => {});
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
          const userId = await resolveOwnerUserIdForJob(jobId);
          if (!userId) {
            await instance.answerCallbackQuery(query.id, {
              text: "No owner for job — set DEFAULT_PIPELINE_USER_ID",
            });
            return;
          }
          const job = await jobService.approveJob(jobId, userId, { channel: "telegram" });
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
          const userId = await resolveOwnerUserIdForJob(jobId);
          if (!userId) {
            await instance.answerCallbackQuery(query.id, { text: "No job owner configured" });
            return;
          }
          const job = await jobService.rejectJob(jobId, userId);
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

function logStartupConfig() {
  logTelegramStartupDiagnostics();
}

/**
 * Starts the Telegram bot singleton. Never throws; failures are logged only.
 */
function startTelegram() {
  logStartupConfig();
  telegramState.enabled = isTelegramEnabled();

  if (!isTelegramEnabled()) {
    telegramState.status = "disabled";
    console.log("[Telegram] disabled (TELEGRAM_ENABLED is not true)");
    return null;
  }

  if (!hasTelegramCredentials()) {
    telegramState.status = "disabled";
    console.warn("[Telegram] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — bot not started");
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
    console.log("[Telegram] bot client created");
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
  console.log("[Telegram] stopped");
}

async function sendMessageToChat(chatId, text, extra = {}) {
  if (!canSendOutbound() || !chatId) {
    return { ok: false, error: "Telegram not ready or chat id missing" };
  }
  try {
    await bot.sendMessage(chatId, text, extra);
    return { ok: true, chatId };
  } catch (error) {
    console.error("[Telegram] sendMessage error:", error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

async function sendTestMessage(userId) {
  if (!isTelegramEnabled()) {
    return { ok: false, statusCode: 503, error: "Telegram disabled (TELEGRAM_ENABLED)" };
  }
  if (!hasTelegramCredentials()) {
    return { ok: false, statusCode: 503, error: "Missing bot token or chat id" };
  }
  if (!bot) {
    startTelegram();
  }
  if (!bot) {
    return { ok: false, statusCode: 503, error: "Bot not initialized" };
  }

  const chatId = resolveChatIdForUser(userId);
  if (!chatId) {
    return {
      ok: false,
      statusCode: 400,
      error: "No chat id for user — set TELEGRAM_CHAT_ID or TELEGRAM_CHAT_MAP",
    };
  }

  const text = "✅ Telegram integration working";
  const result = await sendMessageToChat(chatId, text);
  if (!result.ok) {
    return { ok: false, statusCode: 502, error: result.error, chatId };
  }
  return { ok: true, chatId, userId: userId ? String(userId) : null };
}

const sendJobNotification = async (job) => {
  if (!canSendOutbound()) {
    console.warn("[Telegram] skip job notification — outbound not ready");
    return;
  }

  try {
    const { chatId, userId } = await resolveChatForJob(job);
    if (!chatId) {
      console.warn("[Telegram] skip job notification — no chat id for user", userId);
      return;
    }

    const aiScore = job.resumeMatchScore ?? 0;
    const confidence = job.confidence ?? 0;
    const resumeTitle =
      job.recommendedResumeId?.title ||
      (typeof job.recommendedResumeId === "object" && job.recommendedResumeId?.title) ||
      "—";
    const matched =
      Array.isArray(job.matchedSkills) && job.matchedSkills.length
        ? job.matchedSkills.slice(0, 8).join(", ")
        : "—";
    const missing =
      Array.isArray(job.missingSkills) && job.missingSkills.length
        ? job.missingSkills.slice(0, 8).join(", ")
        : "—";

    const message = `
🔥 New Job Match — Approval Required

🏢 Company: ${job.company}
💼 Role: ${job.role}
📍 Location: ${job.location || "—"}
📊 Pipeline Score: ${job.matchScore ?? 0}%
🤖 AI Resume Match: ${aiScore}%
🎯 Confidence: ${confidence}%
📄 Recommended Resume: ${resumeTitle}
✅ Matched Skills: ${matched}
⚠️ Missing Skills: ${missing}
📈 Experience: ${job.experienceMatch || "—"}
📧 Email: ${job.email}
`;

    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve_${job._id}` },
            { text: "❌ Reject", callback_data: `reject_${job._id}` },
          ],
        ],
      },
    });

    const { emitPipeline } = require("../services/pipelineBus");
    emitPipeline("telegram-approval-requested", {
      jobId: String(job._id),
      userId: userId || (job.userId ? String(job.userId) : undefined),
      role: job.role,
      company: job.company,
    });

    console.log(`[Telegram] approval notification sent job=${job._id} chat=${chatId}`);
  } catch (error) {
    console.error("[Telegram] job notification error:", error?.message || error);
    sendWarningAlert("Telegram Job Notification Failed", error).catch(() => {});
  }
};

const sendAutoApplyNotification = async (job) => {
  if (!canSendOutbound()) return;

  try {
    const { chatId } = await resolveChatForJob(job);
    if (!chatId) return;

    const message = `
🚀 Auto Applied Successfully

🏢 Company: ${job.company}
💼 Role: ${job.role}
🎯 Match Score: ${job.matchScore}%
🤖 AI Match: ${job.resumeMatchScore ?? "—"}%
`;
    await bot.sendMessage(chatId, message);
    console.log(`[Telegram] auto-apply notification sent job=${job._id}`);
  } catch (error) {
    console.error("[Telegram] auto-apply notify error:", error?.message || error);
    sendWarningAlert("Telegram Auto-Apply Notification Failed", error).catch(() => {});
  }
};

const sendApplyFailedNotification = async (job, errorMessage) => {
  if (!canSendOutbound()) return;

  try {
    const { chatId } = await resolveChatForJob(job);
    if (!chatId) return;

    const message = `
❌ Application Failed

🏢 ${job.company}
💼 ${job.role}
⚠️ ${errorMessage || "Unknown error"}
`;
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error("[Telegram] apply-failed notify error:", error?.message || error);
  }
};

const sendMatchUpdatedNotification = async (job) => {
  if (!canSendOutbound()) return;

  try {
    const { chatId } = await resolveChatForJob(job);
    if (!chatId) return;

    const message = `🎯 Match updated: ${job.role} @ ${job.company} — AI score ${job.resumeMatchScore ?? 0}%`;
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error("[Telegram] match notify error:", error?.message || error);
  }
};

module.exports = {
  startTelegram,
  stopTelegram,
  getBot,
  getTelegramState,
  sendJobNotification,
  sendAutoApplyNotification,
  sendApplyFailedNotification,
  sendMatchUpdatedNotification,
  sendTestMessage,
};
