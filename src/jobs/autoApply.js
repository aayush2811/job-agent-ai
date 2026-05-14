const sendJobApplicationEmail = require("../email/sendEmail");
const { sendAutoApplyNotification } = require("../telegram/bot");
const { sendErrorAlert } = require("../utils/errorNotifier");

async function autoApply(job) {
  if (job.applied || job.emailSent) {
    console.log("⚠️ Email Already Sent");
    return;
  }

  console.log("🚀 Auto Apply Started");

  try {
    await sendJobApplicationEmail(job);
  } catch {
    // sendErrorAlert already sent from sendEmail.js
    return;
  }

  try {
    job.applied = true;
    job.emailSent = true;
    job.appliedAt = new Date();

    await job.save();
    await sendAutoApplyNotification(job);

    console.log("✅ Auto Apply Success");
  } catch (error) {
    console.error(
      `[AutoApply] post-email step failed company=${job?.company} role=${job?.role}:`,
      error?.message || error
    );
    await sendErrorAlert("Auto Apply Failed", error);
  }
}

module.exports = autoApply;
