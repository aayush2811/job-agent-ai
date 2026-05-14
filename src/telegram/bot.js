const TelegramBot = require("node-telegram-bot-api");
const sendJobApplicationEmail = require("../email/sendEmail");
const { sendErrorAlert } = require("../utils/errorNotifier");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});
const Job = require("../jobs/job.model");

bot.on("polling_error", async (err) => {
  console.error("[Telegram] polling_error:", err?.message || err);
  await sendErrorAlert("Telegram Polling Error", err);
});

bot.on("callback_query", async (query) => {
  try {
    const data = query.data;

    const chatId = query.message.chat.id;

    console.log("🛠 Callback Data:", data);

    const [action, jobId] = data.split("_");

    const job = await Job.findById(jobId);

    if (!job) {
      return bot.sendMessage(chatId, "❌ Job Not Found");
    }

    // Prevent multiple approvals
    if (job.applied || job.emailSent) {
      return bot.answerCallbackQuery(query.id, {
        text: "Already Applied ✅",
      });
    }

    // APPROVE
    if (action === "approve") {
      try {
        await sendJobApplicationEmail(job);
      } catch {
        await bot.answerCallbackQuery(query.id, {
          text: "❌ Email failed — see alerts",
        });
        return;
      }

      job.applied = true;
      job.emailSent = true;
      job.appliedAt = new Date();

      await job.save();

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

      await bot.sendMessage(chatId, `✅ Approved Application for ${job.role}`);

      console.log("✅ Job Approved");
    }

    // REJECT
    if (action === "reject") {
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

      console.log("❌ Job Rejected");
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
