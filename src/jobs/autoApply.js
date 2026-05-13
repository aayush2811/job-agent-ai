const sendJobApplicationEmail = require("../email/sendEmail");
const { sendAutoApplyNotification } = require("../telegram/bot");

async function autoApply(job) {
  if (job.applied || job.emailSent) {
    console.log("⚠️ Email Already Sent");
    return;
  }

  console.log("🚀 Auto Apply Started");

  await sendJobApplicationEmail(job);

  job.applied = true;
  job.emailSent = true;
  job.appliedAt = new Date();

  await job.save();
  await sendAutoApplyNotification(job);

  console.log("✅ Auto Apply Success");
}

module.exports = autoApply;
