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

    // APPROVE
    if (action === "approve") {
      await sendJobApplicationEmail(job);
      job.applied = true;

      await job.save();

      await bot.sendMessage(chatId, `✅ Approved Application for ${job.role}`);

      console.log("✅ Job Approved");
    }

    // REJECT
    if (action === "reject") {
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

module.exports = {
  bot,
  sendJobNotification,
};
