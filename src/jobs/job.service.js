const mongoose = require("mongoose");
const Job = require("./job.model");
const sendJobApplicationEmail = require("../email/sendEmail");

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

async function getJobs(query) {
  const page = Math.max(1, parseInt(String(query.page || DEFAULT_PAGE), 10) || 1);
  const limitRaw =
    parseInt(String(query.limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, limitRaw), MAX_LIMIT);
  const skip = (page - 1) * limit;

  const filter = {};
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

  const [total, jobs] = await Promise.all([
    Job.countDocuments(filter),
    Job.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select("-text")
      .lean()
      .exec(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

async function getJobById(id) {
  assertValidObjectId(id);
  const job = await Job.findById(id).lean().exec();
  if (!job) {
    throw httpError(404, "Job not found");
  }
  return job;
}

async function approveJob(id) {
  assertValidObjectId(id);
  const job = await Job.findById(id).exec();
  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (job.applied || job.emailSent) {
    throw httpError(409, "Job already approved or email already sent");
  }

  if (job.status === "rejected") {
    throw httpError(409, "Cannot approve a rejected job");
  }

  try {
    await sendJobApplicationEmail(job);
  } catch {
    throw httpError(502, "Failed to send application email");
  }

  job.applied = true;
  job.emailSent = true;
  job.appliedAt = new Date();
  job.status = "approved";

  await job.save();
  const lean = await Job.findById(job._id).select("-text").lean().exec();
  return lean;
}

async function rejectJob(id) {
  assertValidObjectId(id);
  const job = await Job.findById(id).exec();
  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (job.applied || job.emailSent) {
    throw httpError(409, "Cannot reject a job that was already processed");
  }

  if (job.status === "rejected") {
    throw httpError(409, "Job already rejected");
  }

  job.status = "rejected";
  await job.save();
  const lean = await Job.findById(job._id).select("-text").lean().exec();
  return lean;
}

async function deleteJob(id) {
  assertValidObjectId(id);
  const deleted = await Job.findOneAndDelete({ _id: id })
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

async function getJobStats() {
  const totalJobs = await Job.countDocuments();
  const rows = await Job.aggregate([
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
    totalJobs,
    pending: counts.pending,
    approved: counts.approved,
    autoApplied: counts.auto_applied,
    rejected: counts.rejected,
    failed: counts.failed,
  };
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
