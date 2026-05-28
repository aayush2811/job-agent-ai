const Job = require("../jobs/job.model");
const sendJobApplicationEmail = require("../email/sendEmail");
const { sendAutoApplyNotification, sendApplyFailedNotification } = require("../telegram/bot");
const { sendErrorAlert } = require("../utils/errorNotifier");
const Application = require("../models/application.model");
const { logActivity } = require("./activityLog.service");
const { emitPipeline } = require("./pipelineBus");

const MAX_RETRIES = parseInt(process.env.APPLY_MAX_RETRIES || "3", 10);
const BASE_BACKOFF_MS = parseInt(process.env.APPLY_RETRY_BASE_MS || "2000", 10);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ownerId(job) {
  return job?.userId ? String(job.userId) : undefined;
}

async function upsertApplication(jobId, patch, jobDoc = null) {
  let userId = patch.userId;
  if (!userId) {
    const job = jobDoc || (await Job.findById(jobId).select("userId").lean());
    userId = job?.userId || null;
  }
  return Application.findOneAndUpdate(
    { jobId },
    { $set: { jobId, userId, ...patch } },
    { new: true, upsert: true }
  );
}

function pipelineExtras(job, extra = {}) {
  return {
    ...extra,
    jobId: String(job._id),
    userId: ownerId(job),
  };
}

async function applyJobWithRetry(job, options) {
  const { source = "auto", onSuccessExtra } = options || {};
  const jobId = job._id;

  await upsertApplication(jobId, {
    status: "applying",
    channel: source,
    attempts: 0,
  });

  emitPipeline("dashboard-update", pipelineExtras(job, { reason: "application-start" }));

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    await upsertApplication(jobId, {
      status: attempt > 1 ? "retrying" : "applying",
      attempts: attempt,
    });

    if (attempt > 1) {
      emitPipeline(
        "application-retrying",
        pipelineExtras(job, { attempt, max: MAX_RETRIES })
      );
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

      emitPipeline(
        "job-applied",
        pipelineExtras(job, { status: job.status, source, attempts: attempt })
      );
      emitPipeline("dashboard-update", pipelineExtras(job, { reason: "job-applied" }));

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

  emitPipeline(
    "application-failed",
    pipelineExtras(job, {
      error: lastErr?.message || String(lastErr),
      attempts: MAX_RETRIES,
    })
  );
  emitPipeline("dashboard-update", pipelineExtras(job, { reason: "application-failed" }));

  await logActivity({
    type: "apply_failed",
    message: `Application failed after ${MAX_RETRIES} tries: ${job.role}`,
    jobId,
    severity: "error",
    meta: { error: lastErr?.message },
  });
  await sendApplyFailedNotification(job, lastErr?.message || String(lastErr));
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
