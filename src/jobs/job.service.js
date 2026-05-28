const mongoose = require("mongoose");
const Job = require("./job.model");
const { isDbReady } = require("../utils/dbGuard");
const { ownedBy } = require("../middleware/ownership");
const approvalQueue = require("../services/approvalQueue.service");
const applicationEngine = require("../services/applicationEngine.service");
const { emitPipeline } = require("../services/pipelineBus");
const { logActivity } = require("../services/activityLog.service");
const Application = require("../models/application.model");

const EMPTY_JOB_STATS = {
  total: 0,
  totalJobs: 0,
  pending: 0,
  approved: 0,
  autoApplied: 0,
  rejected: 0,
  failed: 0,
};

const EMPTY_JOBS_LIST = {
  jobs: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
};

const VALID_STATUSES = new Set(Job.JOB_STATUS || []);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "matchScore",
  "role",
  "company",
  "status",
]);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSort(sortParam) {
  if (!sortParam || typeof sortParam !== "string") {
    return { createdAt: -1 };
  }
  const first = sortParam.split(",")[0].trim();
  if (!first) return { createdAt: -1 };
  const desc = first.startsWith("-");
  const field = desc ? first.slice(1) : first;
  if (!ALLOWED_SORT_FIELDS.has(field)) {
    return { createdAt: -1 };
  }
  return { [field]: desc ? -1 : 1 };
}

function assertValidObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw httpError(400, "Invalid job id");
  }
}

/**
 * Backfill `status` for documents created before the enum existed.
 */
async function migrateLegacyJobStatuses() {
  try {
    const res = await Job.updateMany(
      {
        $or: [
          { status: { $exists: false } },
          { status: null },
          { status: "" },
        ],
      },
      [
        {
          $set: {
            status: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ["$applied", true] },
                    { $eq: ["$emailSent", true] },
                  ],
                },
                then: {
                  $cond: {
                    if: { $gte: [{ $ifNull: ["$matchScore", 0] }, 90] },
                    then: "auto_applied",
                    else: "approved",
                  },
                },
                else: "pending",
              },
            },
          },
        },
      ]
    );
    if (res.modifiedCount > 0) {
      console.log(
        `[Jobs] migrated legacy status on ${res.modifiedCount} document(s)`
      );
    }
  } catch (e) {
    console.error("[Jobs] legacy status migration warning:", e?.message || e);
  }
}

async function assertJobOwner(id, userId) {
  assertValidObjectId(id);
  const job = await Job.findOne({ _id: id, ...ownedBy(userId) }).exec();
  if (!job) throw httpError(404, "Job not found");
  return job;
}

async function getJobs(query, userId) {
  if (!isDbReady()) {
    return {
      ...EMPTY_JOBS_LIST,
      pagination: {
        page: Math.max(1, parseInt(String(query?.page || DEFAULT_PAGE), 10) || 1),
        limit: Math.min(
          MAX_LIMIT,
          Math.max(1, parseInt(String(query?.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
        ),
        total: 0,
        totalPages: 0,
      },
    };
  }

  const page = Math.max(1, parseInt(String(query.page || DEFAULT_PAGE), 10) || 1);
  const limitRaw =
    parseInt(String(query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, limitRaw), MAX_LIMIT);
  const skip = (page - 1) * limit;

  const filter = { ...ownedBy(userId) };
  if (query.status && typeof query.status === "string") {
    const st = String(query.status);
    if (VALID_STATUSES.has(st)) {
      filter.status = st;
    }
  }

  if (query.search && String(query.search).trim()) {
    const s = escapeRegex(String(query.search).trim());
    filter.$or = [
      { company: { $regex: s, $options: "i" } },
      { role: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
      { location: { $regex: s, $options: "i" } },
    ];
  }

  const sort = parseSort(query.sort);

  try {
    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("-text")
        .populate("recommendedResumeId", "title category isDefault fileUrl")
        .lean()
        .exec(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  } catch (err) {
    console.error("[Jobs] getJobs failed:", err?.message || err);
    return {
      ...EMPTY_JOBS_LIST,
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }
}

async function getJobById(id, userId) {
  if (!isDbReady()) {
    throw httpError(503, "Database unavailable");
  }
  assertValidObjectId(id);
  const job = await Job.findOne({ _id: id, ...ownedBy(userId) })
    .populate("recommendedResumeId", "title category isDefault fileUrl")
    .lean()
    .exec();
  if (!job) {
    throw httpError(404, "Job not found");
  }
  return job;
}

async function approveJob(id, userId, options = {}) {
  assertValidObjectId(id);
  const job = await assertJobOwner(id, userId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (job.applied || job.emailSent) {
    throw httpError(409, "Job already approved or email already sent");
  }

  if (job.status === "rejected") {
    throw httpError(409, "Cannot approve a rejected job");
  }

  approvalQueue.clear(String(id));

  const source =
    options.channel === "telegram" ? "manual_telegram" : "manual_api";

  const result =
    source === "manual_telegram"
      ? await applicationEngine.applyFromApproval(job)
      : await applicationEngine.applyFromApi(job);

  if (!result?.ok) {
    throw httpError(502, "Failed to send application email after retries");
  }

  const lean = await Job.findById(job._id).select("-text").lean().exec();

  const uid = job.userId ? String(job.userId) : undefined;
  emitPipeline("approval-resolved", {
    jobId: String(id),
    userId: uid,
    action: "approved",
    source,
  });
  emitPipeline("dashboard-update", {
    reason: "approval-approved",
    jobId: String(id),
    userId: uid,
  });

  await logActivity({
    type: "job_approved",
    message: `Job approved (${source}): ${lean.role}`,
    jobId: job._id,
    meta: { source },
  });

  return lean;
}

async function rejectJob(id, userId) {
  assertValidObjectId(id);
  const job = await assertJobOwner(id, userId);

  if (job.applied || job.emailSent) {
    throw httpError(409, "Cannot reject a job that was already processed");
  }

  if (job.status === "rejected") {
    throw httpError(409, "Job already rejected");
  }

  approvalQueue.clear(String(id));

  job.status = "rejected";
  await job.save();

  await Application.findOneAndUpdate(
    { jobId: job._id },
    { $set: { jobId: job._id, status: "rejected", channel: "manual_api" } },
    { upsert: true }
  );

  const lean = await Job.findById(job._id).select("-text").lean().exec();

  const uid = job.userId ? String(job.userId) : undefined;
  emitPipeline("approval-resolved", {
    jobId: String(id),
    userId: uid,
    action: "rejected",
    source: "api",
  });
  emitPipeline("dashboard-update", {
    reason: "job-rejected",
    jobId: String(id),
    userId: uid,
  });

  await logActivity({
    type: "job_rejected",
    message: `Job rejected: ${job.role}`,
    jobId: job._id,
  });

  return lean;
}

async function deleteJob(id, userId) {
  assertValidObjectId(id);
  const deleted = await Job.findOneAndDelete({ _id: id, ...ownedBy(userId) })
    .select(
      "_id company role status matchScore applied emailSent appliedAt createdAt"
    )
    .lean()
    .exec();
  if (!deleted) {
    throw httpError(404, "Job not found");
  }
  return deleted;
}

async function getJobStats(userId) {
  if (!isDbReady()) {
    return { ...EMPTY_JOB_STATS };
  }

  const owner = ownedBy(userId);

  try {
    const totalJobs = await Job.countDocuments(owner);
    const rows = await Job.aggregate([
      { $match: owner },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const counts = {
      pending: 0,
      approved: 0,
      auto_applied: 0,
      rejected: 0,
      failed: 0,
    };

    for (const row of rows) {
      const key = row._id;
      if (key && Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] = row.count || 0;
      }
    }

    return {
      total: totalJobs,
      totalJobs,
      pending: counts.pending,
      approved: counts.approved,
      autoApplied: counts.auto_applied,
      rejected: counts.rejected,
      failed: counts.failed,
    };
  } catch (err) {
    console.error("[Jobs] getJobStats failed:", err?.message || err);
    return { ...EMPTY_JOB_STATS };
  }
}

module.exports = {
  migrateLegacyJobStatuses,
  getJobs,
  getJobById,
  approveJob,
  rejectJob,
  deleteJob,
  getJobStats,
};
