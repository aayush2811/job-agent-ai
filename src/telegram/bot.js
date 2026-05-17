const { sendErrorAlert } = require("../utils/errorNotifier");

/** @type {import('node-telegram-bot-api') | null} */
let bot = null;
let handlersBound = false;
let pollingStarted = false;

const telegramState = {
  status: "disabled",
  lastError: null,
};

function getTelegramState() {
  return { ...telegramState, pollingStarted };
}

function getBot() {
  return bot;
}

function bindHandlers(instance) {
  if (handlersBound) return;
  handlersBound = true;

  const jobService = require("../jobs/job.service");

  instance.on("polling_error", (err) => {
    telegramState.lastError = err?.message || String(err);
    console.error("[Telegram] polling_error:", telegramState.lastError);
    sendErrorAlert("Telegram Polling Error", err).catch(() => {});
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
      sendErrorAlert("Telegram Approval Callback", error).catch(() => {});
    }
  });
}

function startTelegram() {
  if (pollingStarted) return getBot();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    telegramState.status = "disabled";
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN missing — bot not started");
    return null;
  }

  try {
    const TelegramBot = require("node-telegram-bot-api");
    bot = new TelegramBot(token, { polling: true });
    bindHandlers(bot);
    pollingStarted = true;
    telegramState.status = "running";
    console.log("[Telegram] polling started");
    return bot;
  } catch (err) {
    telegramState.status = "error";
    telegramState.lastError = err?.message || String(err);
    console.error("[Telegram] start failed:", telegramState.lastError);
    return null;
  }
}

async function stopTelegram() {
  if (!bot) return;
  try {
    await bot.stopPolling();
  } catch (err) {
    console.warn("[Telegram] stopPolling:", err?.message);
  }
  bot = null;
  pollingStarted = false;
  handlersBound = false;
  telegramState.status = "stopped";
}

const sendJobNotification = async (job) => {
  const instance = bot || startTelegram();
  if (!instance || !process.env.TELEGRAM_CHAT_ID) return;

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
    sendErrorAlert("Telegram Job Notification Failed", error).catch(() => {});
  }
};

const sendAutoApplyNotification = async (job) => {
  const instance = bot || startTelegram();
  if (!instance || !process.env.TELEGRAM_CHAT_ID) return;

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
    sendErrorAlert("Telegram Auto-Apply Notification Failed", error).catch(() => {});
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
