const Job = require("../jobs/job.model");
const sendJobApplicationEmail = require("../email/sendEmail");
const { sendAutoApplyNotification } = require("../telegram/bot");
const { sendErrorAlert } = require("../utils/errorNotifier");
const Application = require("../models/application.model");
const { logActivity } = require("./activityLog.service");
const { emitPipeline } = require("./pipelineBus");

const MAX_RETRIES = parseInt(process.env.APPLY_MAX_RETRIES || "3", 10);
const BASE_BACKOFF_MS = parseInt(process.env.APPLY_RETRY_BASE_MS || "2000", 10);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertApplication(jobId, patch) {
  return Application.findOneAndUpdate(
    { jobId },
    { $set: { jobId, ...patch } },
    { new: true, upsert: true }
  );
}

async function applyJobWithRetry(job, options) {
  const { source = "auto", onSuccessExtra } = options || {};
  const jobId = job._id;

  await upsertApplication(jobId, {
    status: "applying",
    channel: source,
    attempts: 0,
  });

  emitPipeline("dashboard-update", { reason: "application-start", jobId: String(jobId) });

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    await upsertApplication(jobId, {
      status: attempt > 1 ? "retrying" : "applying",
      attempts: attempt,
    });

    if (attempt > 1) {
      emitPipeline("application-retrying", {
        jobId: String(jobId),
        attempt,
        max: MAX_RETRIES,
      });
      await logActivity({
        type: "apply_retry",
        message: `Retry ${attempt}/${MAX_RETRIES} for ${job.role}`,
        jobId,
        severity: "warn",
        meta: { attempt },
      });
    }

    try {
      await sendJobApplicationEmail(job);
      job.applied = true;
      job.emailSent = true;
      job.appliedAt = new Date();
      if (source === "auto") {
        job.status = "auto_applied";
      } else {
        job.status = "approved";
      }
      await job.save();

      await upsertApplication(jobId, {
        status: "applied",
        appliedAt: new Date(),
        lastError: null,
        metadata: { source, attempts: attempt },
      });

      await logActivity({
        type: "apply_success",
        message: `Application email sent (${source}) for ${job.role}`,
        jobId,
        meta: { source, attempts: attempt },
      });

      emitPipeline("job-applied", {
        jobId: String(jobId),
        status: job.status,
        source,
        attempts: attempt,
      });
      emitPipeline("dashboard-update", { reason: "job-applied", jobId: String(jobId) });

      if (typeof onSuccessExtra === "function") {
        await onSuccessExtra(job);
      } else if (source === "auto") {
        await sendAutoApplyNotification(job);
      }

      return { ok: true, attempts: attempt };
    } catch (err) {
      lastErr = err;
      await upsertApplication(jobId, {
        lastError: err?.message || String(err),
      });
      if (attempt < MAX_RETRIES) {
        await delay(BASE_BACKOFF_MS * attempt);
      }
    }
  }

  try {
    job.status = "failed";
    await job.save();
  } catch {
    // ignore
  }

  await upsertApplication(jobId, {
    status: "failed",
    lastError: lastErr?.message || String(lastErr),
  });

  emitPipeline("application-failed", {
    jobId: String(jobId),
    error: lastErr?.message || String(lastErr),
    attempts: MAX_RETRIES,
  });
  emitPipeline("dashboard-update", { reason: "application-failed", jobId: String(jobId) });

  await logActivity({
    type: "apply_failed",
    message: `Application failed after ${MAX_RETRIES} tries: ${job.role}`,
    jobId,
    severity: "error",
    meta: { error: lastErr?.message },
  });
  await sendErrorAlert("Application Pipeline Failed", lastErr);
  return { ok: false, error: lastErr };
}

async function applyAuto(job) {
  return applyJobWithRetry(job, { source: "auto" });
}

async function applyFromApproval(job) {
  return applyJobWithRetry(job, { source: "manual_telegram" });
}

async function applyFromApi(job) {
  return applyJobWithRetry(job, { source: "manual_api" });
}

module.exports = {
  applyJobWithRetry,
  applyAuto,
  applyFromApproval,
  applyFromApi,
  upsertApplication,
};
