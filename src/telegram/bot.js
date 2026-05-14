const TelegramBot = require("node-telegram-bot-api");
const { sendErrorAlert } = require("../utils/errorNotifier");
const jobService = require("../jobs/job.service");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

bot.on("polling_error", async (err) => {
  console.error("[Telegram] polling_error:", err?.message || err);
  await sendErrorAlert("Telegram Polling Error", err);
});

bot.on("callback_query", async (query) => {
  try {
    const data = query.data;
    const chatId = query.message.chat.id;

    console.log("[Telegram] callback data:", data);

    const [action, jobId] = data.split("_");

    if (action === "approve") {
      try {
        const job = await jobService.approveJob(jobId);

        await bot.editMessageReplyMarkup(
          {
            inline_keyboard: [
              [
                {
                  text: "✅ APPROVED",
                  callback_data: "approved",
                },
              ],
            ],
          },
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          }
        );

        await bot.sendMessage(
          chatId,
          `✅ Approved Application for ${job.role}`
        );
        await bot.answerCallbackQuery(query.id);
        console.log("[Telegram] job approved id=", jobId);
      } catch (e) {
        const code = e.statusCode;
        if (code === 404) {
          await bot.answerCallbackQuery(query.id, { text: "Job not found" });
          return;
        }
        if (code === 409) {
          await bot.answerCallbackQuery(query.id, { text: e.message });
          return;
        }
        if (code === 502) {
          await bot.answerCallbackQuery(query.id, {
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

        await bot.editMessageReplyMarkup(
          {
            inline_keyboard: [
              [
                {
                  text: "❌ REJECTED",
                  callback_data: "rejected",
                },
              ],
            ],
          },
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          }
        );

        await bot.sendMessage(chatId, `❌ Rejected ${job.role}`);
        await bot.answerCallbackQuery(query.id);
        console.log("[Telegram] job rejected id=", jobId);
      } catch (e) {
        const code = e.statusCode;
        if (code === 404) {
          await bot.answerCallbackQuery(query.id, { text: "Job not found" });
          return;
        }
        if (code === 409) {
          await bot.answerCallbackQuery(query.id, { text: e.message });
          return;
        }
        throw e;
      }
      return;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("[Telegram] callback error:", error?.message || error);
    await sendErrorAlert("Telegram Approval Callback", error);
  }
});

const sendJobNotification = async (job) => {
  try {
    const message = `
🔥 New Job Match

🏢 Company: ${job.company}

💼 Role: ${job.role}

📍 Location: ${job.location}

🎯 Match Score: ${job.matchScore}%

📧 Email: ${job.email}
`;

    await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Approve",
              callback_data: `approve_${job._id}`,
            },

            {
              text: "❌ Reject",
              callback_data: `reject_${job._id}`,
            },
          ],
        ],
      },
    });

    console.log("[Telegram] job notification sent");
  } catch (error) {
    console.error("[Telegram] job notification error:", error?.message || error);
    await sendErrorAlert("Telegram Job Notification Failed", error);
  }
};

const sendAutoApplyNotification = async (job) => {
  try {
    const message = `
🚀 Auto Applied Successfully

🏢 Company: ${job.company}
💼 Role: ${job.role}
🎯 Match Score: ${job.matchScore}%
`;

    await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message);

    console.log("[Telegram] auto-apply notification sent");
  } catch (error) {
    console.error("[Telegram] auto-apply notify error:", error?.message || error);
    await sendErrorAlert("Telegram Auto-Apply Notification Failed", error);
  }
};

module.exports = {
  bot,
  sendJobNotification,
  sendAutoApplyNotification,
};
