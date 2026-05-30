const Job = require("../jobs/job.model");
const ActivityLog = require("../models/activityLog.model");
const { ownedBy } = require("../middleware/ownership");
const { MIN_SCORE, AUTO_APPLY_THRESHOLD } = require("../services/jobPipeline.service");
const { resolvePipelineUserId } = require("../users/pipelineOwner");

async function getJobAudit(currentUserId) {
  const pipelineOwnerId = await resolvePipelineUserId();

  const [
    totalJobs,
    jobsWithUserId,
    jobsWithoutUserId,
    pendingJobs,
    approvalJobs,
    appliedJobs,
    jobsMissingNotifications,
    jobsVisibleToCurrentUser,
    jobsCreatedActivity,
    approvalsCreatedActivity,
    telegramSentActivity,
    jobsCreatedPipeline,
    telegramNotifiedJobs,
  ] = await Promise.all([
    Job.countDocuments(),
    Job.countDocuments({ userId: { $ne: null } }),
    Job.countDocuments({
      $or: [{ userId: null }, { userId: { $exists: false } }],
    }),
    Job.countDocuments({ status: "pending" }),
    Job.countDocuments({ status: "pending", matchScore: { $gte: MIN_SCORE, $lt: AUTO_APPLY_THRESHOLD } }),
    Job.countDocuments({
      status: { $in: ["approved", "auto_applied"] },
      applied: true,
    }),
    Job.countDocuments({
      status: "pending",
      matchScore: { $gte: MIN_SCORE, $lt: AUTO_APPLY_THRESHOLD },
      telegramNotifiedAt: null,
    }),
    Job.countDocuments(ownedBy(currentUserId)),
    ActivityLog.countDocuments({ type: "job_created" }),
    ActivityLog.countDocuments({ type: "approval_queued" }),
    ActivityLog.countDocuments({ type: "telegram_notification_sent" }),
    Job.countDocuments({ createdAt: { $exists: true } }),
    Job.countDocuments({ telegramNotifiedAt: { $ne: null } }),
  ]);

  const sampleOrphanJobs = await Job.find({
    $or: [{ userId: null }, { userId: { $exists: false } }],
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("_id role company status matchScore createdAt")
    .lean();

  return {
    totalJobs,
    jobsWithUserId,
    jobsWithoutUserId,
    pendingJobs,
    approvalJobs,
    appliedJobs,
    jobsMissingNotifications,
    jobsVisibleToCurrentUser,
    pipelineCounts: {
      jobsCreated: jobsCreatedActivity || jobsCreatedPipeline,
      approvalsCreated: approvalsCreatedActivity,
      telegramNotificationsSent: telegramSentActivity || telegramNotifiedJobs,
    },
    thresholds: {
      minScore: MIN_SCORE,
      autoApplyThreshold: AUTO_APPLY_THRESHOLD,
      telegramQueueRange: `${MIN_SCORE}-${AUTO_APPLY_THRESHOLD - 1}`,
    },
    ownership: {
      currentUserId: String(currentUserId),
      pipelineOwnerId: pipelineOwnerId ? String(pipelineOwnerId) : null,
      defaultPipelineUserIdEnv: process.env.DEFAULT_PIPELINE_USER_ID || null,
      mismatch:
        pipelineOwnerId && currentUserId
          ? String(pipelineOwnerId) !== String(currentUserId)
          : false,
    },
    sampleOrphanJobs: sampleOrphanJobs.map((j) => ({
      id: String(j._id),
      role: j.role,
      company: j.company,
      status: j.status,
      matchScore: j.matchScore,
      createdAt: j.createdAt,
    })),
  };
}

module.exports = { getJobAudit };
