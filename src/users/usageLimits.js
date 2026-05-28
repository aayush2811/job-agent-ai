const User = require("./user.model");

const PLAN_LIMITS = {
  free: {
    maxResumes: parseInt(process.env.FREE_MAX_RESUMES || "5", 10),
    maxJobsPerDay: parseInt(process.env.FREE_MAX_JOBS_PER_DAY || "50", 10),
    maxUploadsPerDay: parseInt(process.env.FREE_MAX_UPLOADS_PER_DAY || "10", 10),
    maxPendingApprovals: parseInt(process.env.FREE_MAX_PENDING_APPROVALS || "25", 10),
  },
  pro: {
    maxResumes: parseInt(process.env.PRO_MAX_RESUMES || "50", 10),
    maxJobsPerDay: parseInt(process.env.PRO_MAX_JOBS_PER_DAY || "500", 10),
    maxUploadsPerDay: parseInt(process.env.PRO_MAX_UPLOADS_PER_DAY || "100", 10),
    maxPendingApprovals: parseInt(process.env.PRO_MAX_PENDING_APPROVALS || "200", 10),
  },
  enterprise: {
    maxResumes: 9999,
    maxJobsPerDay: 99999,
    maxUploadsPerDay: 9999,
    maxPendingApprovals: 9999,
  },
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function resetDailyUsageIfNeeded(user) {
  const key = todayKey();
  if (user.usage?.lastResetDay === key) return user;
  user.usage = user.usage || {};
  user.usage.jobsToday = 0;
  user.usage.uploadsToday = 0;
  user.usage.lastResetDay = key;
  await user.save();
  return user;
}

function limitsForPlan(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function limitError(message) {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = "USAGE_LIMIT";
  return err;
}

async function checkResumeUploadLimit(user) {
  const u = await resetDailyUsageIfNeeded(user);
  const limits = limitsForPlan(u.plan);
  if ((u.usage?.resumesCount || 0) >= limits.maxResumes) {
    throw limitError(`Resume limit reached (${limits.maxResumes}) for ${u.plan} plan`);
  }
  if ((u.usage?.uploadsToday || 0) >= limits.maxUploadsPerDay) {
    throw limitError(`Daily upload limit reached (${limits.maxUploadsPerDay})`);
  }
}

async function recordResumeUpload(user) {
  const u = await resetDailyUsageIfNeeded(user);
  u.usage.resumesCount = (u.usage.resumesCount || 0) + 1;
  u.usage.uploadsToday = (u.usage.uploadsToday || 0) + 1;
  await u.save();
}

async function checkJobCreationLimit(user) {
  const u = await resetDailyUsageIfNeeded(user);
  const limits = limitsForPlan(u.plan);
  if ((u.usage?.jobsToday || 0) >= limits.maxJobsPerDay) {
    throw limitError(`Daily job limit reached (${limits.maxJobsPerDay})`);
  }
}

async function recordJobCreated(user) {
  const u = await resetDailyUsageIfNeeded(user);
  u.usage.jobsToday = (u.usage.jobsToday || 0) + 1;
  await u.save();
}

module.exports = {
  PLAN_LIMITS,
  limitsForPlan,
  checkResumeUploadLimit,
  recordResumeUpload,
  checkJobCreationLimit,
  recordJobCreated,
  resetDailyUsageIfNeeded,
};
