const Job = require("../jobs/job.model");

const extractJobData = require("../ai/regexExtractor");

const calculateMatchScore = require("../jobs/matchScorer");

const isJobRelated = require("../utils/jobFilter");

const autoApply = require("../jobs/autoApply");

const {
  sendJobNotification,
} = require("../telegram/bot");
const { sendErrorAlert } = require("../utils/errorNotifier");

const syncOldMessages = async (client) => {
  try {

    console.log("\n📚 Starting Old Message Sync...\n");

    const chats = await client.getChats();

    for (const chat of chats) {

      // Only groups for now
      if (!chat.isGroup) continue;

      console.log(`\n📂 Checking Group: ${chat.name}`);

      const messages = await chat.fetchMessages({
        limit: 10,
      });

      for (const message of messages) {

        try {

          const text = message.body;

          if (!text) continue;

          const isJob = isJobRelated(text);

          if (!isJob) continue;

          const existingJob = await Job.findOne({
            messageId:
              message.id._serialized,
          });

          if (existingJob) {
            console.log(
              "⚠️ Old Message Already Exists - Skipped"
            );
            continue;
          }

          console.log(
            "\n🤖 Processing Old Job Message..."
          );

          const extractedData =
            await extractJobData(text);

          if (
            !extractedData?.role ||
            !extractedData?.email
          ) {
            console.log(
              "⚠️ Old Message Extraction Failed - Missing Role Or Email"
            );

            continue;
          }

          const duplicateJob =
            await Job.findOne({
              company:
                extractedData?.company || "",

              role:
                extractedData?.role || "",

              email:
                extractedData?.email || "",
            });

          if (duplicateJob) {
            console.log(
              "⚠️ Old Duplicate Skipped:",
              {
                company:
                  extractedData?.company || "",
                role:
                  extractedData?.role || "",
                email:
                  extractedData?.email || "",
              }
            );

            continue;
          }

          const alreadyApplied =
            await Job.findOne({
              company: extractedData?.company,

              role: extractedData?.role,

              applied: true,
            });

          if (alreadyApplied) {

            console.log(
              "⚠️ Old Job Already Applied - Skipped"
            );

            continue;
          }

          const matchScore =
            calculateMatchScore(extractedData);

          if (matchScore < 70) {
            console.log(
              `⚠️ Old Low Score Ignored: ${matchScore}%`
            );

            continue;
          }

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

          if (matchScore >= 90) {
            await autoApply(newJob);
            continue;
          }

          console.log(
            "🟡 Old Job Manual Approval Required"
          );

          await sendJobNotification(
            newJob
          );

        } catch (error) {
          console.error(
            "[Sync] old message processing error:",
            error?.message || error
          );
          await sendErrorAlert("Historical Sync — Message Processing", error);
        }
      }
    }

    console.log(
      "\n✅ Old Message Sync Completed"
    );

  } catch (error) {
    console.error("[Sync] syncOldMessages failed:", error?.message || error);
    await sendErrorAlert("Historical Sync Failed", error);
  }
};

module.exports = syncOldMessages;