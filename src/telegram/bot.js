const TelegramBot = require("node-telegram-bot-api");
const sendJobApplicationEmail = require("../email/sendEmail");
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});
const Job = require("../jobs/job.model");

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
      await sendJobApplicationEmail(job);

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
        },
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
        },
      );

      await bot.sendMessage(chatId, `❌ Rejected ${job.role}`);

      console.log("❌ Job Rejected");
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.log("❌ Callback Error:", error.message);
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

    console.log("📨 Telegram Notification Sent");
  } catch (error) {
    console.log("❌ Telegram Error:", error.message);
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

    console.log("📨 Auto Apply Telegram Notification Sent");
  } catch (error) {
    console.log("❌ Telegram Auto Apply Error:", error.message);
  }
};

module.exports = {
  bot,
  sendJobNotification,
  sendAutoApplyNotification,
};
