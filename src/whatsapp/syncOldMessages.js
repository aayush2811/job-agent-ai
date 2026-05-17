const extractJobData = require("../ai/regexExtractor");
const isJobRelated = require("../utils/jobFilter");
const { sendErrorAlert } = require("../utils/errorNotifier");
const jobPipeline = require("../services/jobPipeline.service");

const syncOldMessages = async (client) => {
  try {
    console.log("\n📚 Starting Old Message Sync (pipeline)...\n");

    const chats = await client.getChats();

    for (const chat of chats) {
      if (!chat.isGroup) continue;

      console.log(`\n📂 Checking Group: ${chat.name}`);

      const messages = await chat.fetchMessages({
        limit: 10,
      });

      for (const message of messages) {
        try {
          const text = message.body;
          if (!text) continue;

          if (!isJobRelated(text)) continue;

          const extractedData = await extractJobData(text);
          const result = await jobPipeline.processFromExtraction({
            messageId: message.id._serialized,
            text,
            extractedData,
            source: "whatsapp_sync",
          });

          if (result.ok) {
            console.log("[Sync] pipeline ok:", result.path, String(result.jobId));
          }
        } catch (error) {
          console.error("[Sync] old message processing error:", error?.message || error);
          await sendErrorAlert("Historical Sync — Message Processing", error);
        }
      }
    }

    console.log("\n✅ Old Message Sync Completed");
  } catch (error) {
    console.error("[Sync] syncOldMessages failed:", error?.message || error);
    await sendErrorAlert("Historical Sync Failed", error);
  }
};

module.exports = syncOldMessages;
