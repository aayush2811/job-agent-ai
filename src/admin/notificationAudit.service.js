const Job = require("../jobs/job.model");
const ActivityLog = require("../models/activityLog.model");
const { sendJobNotification } = require("../telegram/bot");
const { MIN_SCORE, AUTO_APPLY_THRESHOLD } = require("../services/jobPipeline.service");

/** Jobs in Telegram approval queue range that never recorded a successful notify */
function approvalQueueFilter() {
  return {
    status: "pending",
    matchScore: { $gte: MIN_SCORE, $lt: AUTO_APPLY_THRESHOLD },
    $or: [{ telegramNotifiedAt: null }, { telegramNotifiedAt: { $exists: false } }],
  };
}

async function diagnoseNotificationGap(job, activityTypes) {
  if (job.telegramNotifiedAt) {
    return "recorded_sent";
  }
  if (job.telegramNotifyError) {
    return "failed_recorded";
  }
  if (job.matchScore >= AUTO_APPLY_THRESHOLD) {
    return "skipped_auto_apply";
  }
  if (job.matchScore < MIN_SCORE) {
    return "skipped_low_score";
  }
  if (activityTypes.includes("telegram_notification_failed")) {
    return "failed_unrecorded";
  }
  if (activityTypes.includes("telegram_notification_sent")) {
    return "sent_unrecorded";
  }
  if (activityTypes.includes("approval_queued")) {
    return "attempted_unrecorded";
  }
  return "never_attempted";
}

function formatJobRow(job, diagnosis) {
  return {
    id: String(job._id),
    title: job.role,
    company: job.company,
    status: job.status,
    score: job.matchScore,
    createdAt: job.createdAt,
    telegramNotifiedAt: job.telegramNotifiedAt,
    telegramNotifyError: job.telegramNotifyError,
    diagnosis,
  };
}

async function getMissingNotifications() {
  const jobs = await Job.find(approvalQueueFilter())
    .sort({ createdAt: -1 })
    .lean();

  const jobIds = jobs.map((j) => j._id);
  const activities = await ActivityLog.find({
    jobId: { $in: jobIds },
    type: {
      $in: [
        "approval_queued",
        "telegram_notification_sent",
        "telegram_notification_failed",
        "job_created",
      ],
    },
  })
    .select("jobId type")
    .lean();

  const activityByJob = new Map();
  for (const row of activities) {
    const key = String(row.jobId);
    if (!activityByJob.has(key)) activityByJob.set(key, []);
    activityByJob.get(key).push(row.type);
  }

  const formatted = [];
  for (const job of jobs) {
    const types = activityByJob.get(String(job._id)) || [];
    const diagnosis = await diagnoseNotificationGap(job, types);
    formatted.push(formatJobRow(job, diagnosis));
  }

  return {
    count: formatted.length,
    thresholds: {
      minScore: MIN_SCORE,
      autoApplyThreshold: AUTO_APPLY_THRESHOLD,
      approvalRange: `${MIN_SCORE}-${AUTO_APPLY_THRESHOLD - 1}`,
    },
    dispatchPath:
      "whatsapp.events → jobPipeline.processFromExtraction → sendJobNotification → approvalQueue.schedule",
    jobs: formatted,
  };
}

async function replayNotifications() {
  const jobs = await Job.find(approvalQueueFilter())
    .populate("recommendedResumeId", "title category isDefault")
    .sort({ createdAt: 1 });

  let scanned = jobs.length;
  let resent = 0;
  let failed = 0;
  const results = [];

  for (const job of jobs) {
    const result = await sendJobNotification(job);
    const refreshed = await Job.findById(job._id)
      .select("telegramNotifiedAt telegramNotifyError role company")
      .lean();

    if (result?.ok) {
      resent += 1;
      results.push({
        id: String(job._id),
        title: job.role,
        ok: true,
        chatId: result.chatId,
        telegramNotifiedAt: refreshed?.telegramNotifiedAt,
      });
    } else {
      failed += 1;
      results.push({
        id: String(job._id),
        title: job.role,
        ok: false,
        error: result?.error || refreshed?.telegramNotifyError || "unknown",
      });
    }
  }

  return { scanned, resent, failed, results };
}

module.exports = {
  getMissingNotifications,
  replayNotifications,
  approvalQueueFilter,
};
