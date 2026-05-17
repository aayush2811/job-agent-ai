const Job = require("../jobs/job.model");
const { emitPipeline } = require("./pipelineBus");
const { logActivity } = require("./activityLog.service");

const timeouts = new Map();

const APPROVAL_TIMEOUT_MS = parseInt(
  process.env.APPROVAL_TIMEOUT_MS || String(24 * 60 * 60 * 1000),
  10
);
const AUTO_APPROVE_ELAPSED_MS = parseInt(
  process.env.AUTO_APPROVE_ELAPSED_MS || "0",
  10
);
const AUTO_APPROVE_MIN_SCORE = parseInt(
  process.env.AUTO_APPROVE_MIN_SCORE || "88",
  10
);

function clear(jobId) {
  const id = String(jobId);
  const h = timeouts.get(id);
  if (h) {
    clearTimeout(h);
    timeouts.delete(id);
  }
}

/**
 * After Telegram notification: start SLA timer + optional deferred auto-approve.
 */
function schedule(job) {
  clear(job._id);

  const id = String(job._id);
  const t = setTimeout(() => onApprovalTimeout(id).catch(() => {}), APPROVAL_TIMEOUT_MS);
  timeouts.set(id, t);

  if (AUTO_APPROVE_ELAPSED_MS > 0) {
    const auto = setTimeout(() => {
      deferredAutoApply(id).catch(() => {});
    }, AUTO_APPROVE_ELAPSED_MS);
    timeouts.set(`${id}_auto`, auto);
  }
}

function clearAll(jobId) {
  const id = String(jobId);
  clear(jobId);
  const h2 = timeouts.get(`${id}_auto`);
  if (h2) {
    clearTimeout(h2);
    timeouts.delete(`${id}_auto`);
  }
}

async function onApprovalTimeout(jobId) {
  timeouts.delete(String(jobId));
  const job = await Job.findById(jobId);
  if (!job || job.status !== "pending" || job.applied) {
    return;
  }

  job.approvalTimedOut = true;
  await job.save();

  emitPipeline("approval-timeout", {
    jobId: String(jobId),
    company: job.company,
    role: job.role,
  });
  emitPipeline("dashboard-update", {
    reason: "approval-timeout",
    jobId: String(jobId),
  });

  await logActivity({
    type: "approval_timeout",
    message: `Approval window expired for ${job.role} @ ${job.company}`,
    jobId: job._id,
    severity: "warn",
  });
}

async function deferredAutoApply(jobId) {
  timeouts.delete(`${jobId}_auto`);
  const applicationEngine = require("./applicationEngine.service");
  const job = await Job.findById(jobId);
  if (
    !job ||
    job.status !== "pending" ||
    job.applied ||
    job.approvalTimedOut
  ) {
    return;
  }
  if ((job.matchScore || 0) < AUTO_APPROVE_MIN_SCORE) {
    return;
  }

  await logActivity({
    type: "auto_approve_elapsed",
    message: `Auto-applying after delay (score ${job.matchScore})`,
    jobId: job._id,
  });

  await applicationEngine.applyAuto(job);
}

module.exports = {
  schedule,
  clear: clearAll,
  APPROVAL_TIMEOUT_MS,
};
