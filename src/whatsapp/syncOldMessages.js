const Job = require("../jobs/job.model");

const extractJobData = require("../ai/regexExtractor");

const calculateMatchScore = require("../jobs/matchScorer");

const isJobRelated = require("../utils/jobFilter");

const {
  sendJobNotification,
} = require("../telegram/bot");

const syncOldMessages = async (client) => {
  try {

    console.log("\n📚 Starting Old Message Sync...\n");

    const chats = await client.getChats();

    for (const chat of chats) {

      // Only groups for now
      if (!chat.isGroup) continue;

      console.log(`\n📂 Checking Group: ${chat.name}`);

      const messages = await chat.fetchMessages({
        limit: 30,
      });

      for (const message of messages) {

        try {

          const text = message.body;

          if (!text) continue;

          const isJob = isJobRelated(text);

          if (!isJob) continue;

          const existingJob = await Job.findOne({
            messageId: message.id._serialized,
          });

          if (existingJob) {
            continue;
          }

          console.log(
            "\n🤖 Processing Old Job Message..."
          );

          const extractedData =
            await extractJobData(text);

          const alreadyApplied =
            await Job.findOne({
              company: extractedData?.company,

              role: extractedData?.role,

              applied: true,
            });

          if (alreadyApplied) {

            console.log(
              "⚠️ Already Applied Previously"
            );

            continue;
          }

          const matchScore =
            calculateMatchScore(extractedData);

          const newJob = await Job.create({
            messageId:
              message.id._serialized,

            text,

            company:
              extractedData?.company || "",

            role:
              extractedData?.role || "",

            location:
              extractedData?.location || "",

            email:
              extractedData?.email || "",

            skills:
              extractedData?.skills || [],

            experience:
              extractedData?.experience || "",

            matchScore,
          });

          console.log(
            "🔥 Old Job Saved:",
            newJob.role
          );

          // Only notify strong matches
          if (matchScore >= 70) {

            await sendJobNotification(
              newJob
            );
          }

        } catch (error) {

          console.log(
            "❌ Old Message Error:",
            error.message
          );
        }
      }
    }

    console.log(
      "\n✅ Old Message Sync Completed"
    );

  } catch (error) {

    console.log(
      "❌ Sync Error:",
      error.message
    );
  }
};

module.exports = syncOldMessages;