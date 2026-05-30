const Job = require("../jobs/job.model");
const { scoreJob } = require("./scoringEngine");
const { emitPipeline } = require("./pipelineBus");
const { logActivity } = require("./activityLog.service");
const applicationEngine = require("./applicationEngine.service");
const approvalQueue = require("./approvalQueue.service");
const { sendJobNotification } = require("../telegram/bot");
const { isDbReady } = require("../utils/dbGuard");
const matchingService = require("../matching/matching.service");
const { resolvePipelineUserId } = require("../users/pipelineOwner");
const { pipelineLog } = require("../utils/pipelineLog");

const MIN_SCORE = parseInt(process.env.JOB_MIN_SCORE || "70", 10);
const AUTO_APPLY_THRESHOLD = parseInt(
  process.env.AUTO_APPLY_THRESHOLD || "90",
  10
);

async function processFromExtraction({
  messageId,
  text,
  extractedData,
  source = "whatsapp",
}) {
  if (!isDbReady()) {
    console.warn("[Pipeline] skipped — database unavailable");
    return { ok: false, reason: "no_db" };
  }

  const existingJob = await Job.findOne({ messageId });
  if (existingJob) {
    return { ok: false, reason: "duplicate_message" };
  }

  if (!extractedData?.role || !extractedData?.email) {
    return { ok: false, reason: "incomplete_extraction" };
  }

  const duplicateJob = await Job.findOne({
    company: extractedData.company || "",
    role: extractedData.role || "",
    email: extractedData.email || "",
  });
  if (duplicateJob) {
    await logActivity({
      type: "job_skipped",
      message: `Duplicate company/role/email: ${extractedData.role}`,
      severity: "info",
      meta: { source },
    });
    return { ok: false, reason: "duplicate_job" };
  }

  const alreadyApplied = await Job.findOne({
    company: extractedData.company,
    role: extractedData.role,
    applied: true,
  });
  if (alreadyApplied) {
    return { ok: false, reason: "already_applied_company" };
  }

  const scored = scoreJob(extractedData, text || "");
  if (scored.score < MIN_SCORE) {
    await logActivity({
      type: "job_low_score",
      message: `Rejected low score ${scored.score} for ${extractedData.role}`,
      severity: "info",
      meta: { scored },
    });
    return { ok: false, reason: "low_score", score: scored.score };
  }

  const pipelineUserId = await resolvePipelineUserId();
  if (!pipelineUserId) {
    console.warn("[Pipeline] no pipeline userId resolved — job will be invisible to SaaS users");
  }

  let newJob = await Job.create({
    messageId,
    text,
    company: extractedData.company || "",
    role: extractedData.role || "",
    location: extractedData.location || "",
    email: extractedData.email || "",
    skills: extractedData.skills || [],
    experience: extractedData.experience || "",
    matchScore: scored.score,
    scoreBreakdown: scored.breakdown,
    scoreRecommendation: scored.recommendation,
    scoringReasoning: scored.reasoning,
    status: "pending",
    source,
    userId: pipelineUserId || null,
  });

  pipelineLog("job_created", {
    jobId: newJob._id,
    userId: pipelineUserId,
    title: newJob.role,
    status: newJob.status,
    matchScore: scored.score,
    source,
  });

  await logActivity({
    type: "job_created",
    message: `Job captured: ${newJob.role} (${scored.score})`,
    jobId: newJob._id,
    meta: { recommendation: scored.recommendation, source, userId: pipelineUserId },
  });

  pipelineLog("job_scored", {
    jobId: newJob._id,
    userId: pipelineUserId,
    title: newJob.role,
    status: newJob.status,
    matchScore: scored.score,
  });

  try {
    await matchingService.matchJobById(newJob._id, { persist: true });
    newJob = await Job.findById(newJob._id)
      .populate("recommendedResumeId", "title category isDefault")
      .exec();
  } catch (matchErr) {
    console.warn("[Pipeline] resume match:", matchErr?.message || matchErr);
  }

  const uid = pipelineUserId ? String(pipelineUserId) : undefined;

  emitPipeline("job-created", {
    jobId: String(newJob._id),
    userId: uid,
    company: newJob.company,
    role: newJob.role,
    source,
  });

  emitPipeline("job-scored", {
    jobId: String(newJob._id),
    userId: uid,
    score: scored.score,
    recommendation: scored.recommendation,
    reasoning: scored.reasoning.slice(0, 12),
  });

  emitPipeline("dashboard-update", {
    reason: "job-created",
    jobId: String(newJob._id),
    userId: uid,
  });

  if (scored.score >= AUTO_APPLY_THRESHOLD) {
    pipelineLog("telegram_notification_skipped", {
      jobId: newJob._id,
      userId: uid,
      title: newJob.role,
      status: newJob.status,
      reason: "auto_apply_threshold",
      matchScore: scored.score,
    });
    await logActivity({
      type: "pipeline_auto_apply",
      message: `Score ${scored.score} ≥ ${AUTO_APPLY_THRESHOLD} — auto apply`,
      jobId: newJob._id,
    });
    const fresh = await Job.findById(newJob._id);
    await applicationEngine.applyAuto(fresh);
    return { ok: true, jobId: newJob._id, path: "auto_apply" };
  }

  pipelineLog("telegram_notification_requested", {
    jobId: newJob._id,
    userId: uid,
    title: newJob.role,
    status: newJob.status,
    matchScore: scored.score,
  });

  const notifyResult = await sendJobNotification(newJob);
  if (notifyResult?.ok) {
    pipelineLog("telegram_notification_sent", {
      jobId: newJob._id,
      userId: uid,
      title: newJob.role,
      status: newJob.status,
      chatId: notifyResult.chatId,
    });
    await logActivity({
      type: "telegram_notification_sent",
      message: `Telegram approval sent: ${newJob.role}`,
      jobId: newJob._id,
      meta: { chatId: notifyResult.chatId },
    });
  } else {
    pipelineLog("telegram_notification_failed", {
      jobId: newJob._id,
      userId: uid,
      title: newJob.role,
      status: newJob.status,
      error: notifyResult?.error || "unknown",
    });
    await logActivity({
      type: "telegram_notification_failed",
      message: `Telegram failed: ${newJob.role} — ${notifyResult?.error || "unknown"}`,
      jobId: newJob._id,
      severity: "warn",
    });
  }

  approvalQueue.schedule(newJob);
  pipelineLog("approval_created", {
    jobId: newJob._id,
    userId: uid,
    title: newJob.role,
    status: newJob.status,
  });

  emitPipeline("approval-pending", {
    jobId: String(newJob._id),
    userId: uid,
    role: newJob.role,
    company: newJob.company,
    expiresInMs: approvalQueue.APPROVAL_TIMEOUT_MS,
  });
  emitPipeline("dashboard-update", {
    reason: "approval-pending",
    jobId: String(newJob._id),
    userId: uid,
  });

  await logActivity({
    type: "approval_queued",
    message: `Awaiting Telegram approval: ${newJob.role}`,
    jobId: newJob._id,
  });

  return { ok: true, jobId: newJob._id, path: "telegram_queue" };
}

module.exports = {
  processFromExtraction,
  MIN_SCORE,
  AUTO_APPLY_THRESHOLD,
};
