const mongoose = require("mongoose");
const Job = require("../jobs/job.model");
const Resume = require("../resumes/resume.model");
const { isDbReady } = require("../utils/dbGuard");
const { ownedBy } = require("../middleware/ownership");
const logger = require("../utils/logger");
const { emitMatchEvent } = require("../sockets/matchingEvents");

const TECH_VOCAB = new Set([
  "javascript",
  "typescript",
  "python",
  "java",
  "nodejs",
  "node",
  "react",
  "express",
  "mongodb",
  "mongo",
  "postgresql",
  "mysql",
  "sql",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "nextjs",
  "next",
  "graphql",
  "redis",
  "tailwind",
  "html",
  "css",
  "git",
  "api",
  "rest",
  "microservices",
  "agile",
  "scrum",
]);

const CATEGORY_ALIASES = {
  general: ["general", "default", "any"],
  backend: ["backend", "back-end", "server", "api"],
  frontend: ["frontend", "front-end", "ui", "web"],
  fullstack: ["fullstack", "full-stack", "full stack"],
  devops: ["devops", "sre", "infrastructure", "cloud"],
  data: ["data", "ml", "machine learning", "ai"],
};

function normalizeToken(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  if (!text) return [];
  const parts = normalizeToken(text).split(/[\s,;/|]+/);
  const out = new Set();
  for (const p of parts) {
    if (p.length < 2) continue;
    out.add(p);
    if (p.endsWith(".js")) out.add(p.replace(/\.js$/, ""));
    if (p === "js") out.add("javascript");
    if (p === "ts") out.add("typescript");
  }
  return [...out];
}

function extractYears(text) {
  const hay = String(text || "");
  const patterns = [
    /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi,
    /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s+experience/gi,
    /experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\+?/gi,
  ];
  let max = 0;
  for (const re of patterns) {
    let m;
    while ((m = re.exec(hay)) !== null) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

/**
 * Extract required skills from job title, description, tags, technologies.
 */
function extractJobSkills(job) {
  const skills = new Set();
  const addTokens = (text) => {
    for (const t of tokenize(text)) {
      skills.add(t);
      if (TECH_VOCAB.has(t)) skills.add(t);
    }
  };

  addTokens(job.role);
  addTokens(job.text);
  addTokens(job.experience);
  addTokens(job.location);

  if (Array.isArray(job.skills)) {
    for (const s of job.skills) addTokens(s);
  }

  const roleLower = normalizeToken(job.role);
  for (const tech of TECH_VOCAB) {
    if (roleLower.includes(tech)) skills.add(tech);
  }

  return [...skills].filter((s) => s.length >= 2).slice(0, 80);
}

function resumeSkillSet(resume) {
  const set = new Set();
  const add = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      for (const t of tokenize(item)) set.add(t);
    }
  };
  add(resume.parsedSkills);
  add(resume.parsedKeywords);
  add(resume.title);
  add(resume.category);
  return [...set];
}

function overlapScore(jobSkills, resumeSkills) {
  if (!jobSkills.length || !resumeSkills.length) return { ratio: 0, matched: [], missing: jobSkills };
  const resumeSet = new Set(resumeSkills);
  const matched = jobSkills.filter((s) => resumeSet.has(s));
  const missing = jobSkills.filter((s) => !resumeSet.has(s));
  const ratio = matched.length / jobSkills.length;
  return { ratio, matched, missing };
}

function keywordBonus(job, resume) {
  const jobTokens = new Set(tokenize(`${job.role} ${job.text}`));
  const resumeTokens = new Set(resumeSkillSet(resume));
  if (!jobTokens.size) return 0;
  let hit = 0;
  for (const t of jobTokens) {
    if (resumeTokens.has(t)) hit += 1;
  }
  return Math.min(1, hit / Math.max(1, jobTokens.size));
}

function experienceScore(job, resume) {
  const required = extractYears(`${job.experience || ""} ${job.text || ""} ${job.role || ""}`);
  const candidate = extractYears(resume.parsedExperience || "");
  if (required <= 0 && candidate <= 0) return { score: 0.5, label: "not specified" };
  if (required <= 0) return { score: 0.7, label: `${candidate}y candidate` };
  if (candidate >= required) return { score: 1, label: `${candidate}y meets ${required}y` };
  if (candidate >= required * 0.7) return { score: 0.75, label: `${candidate}y near ${required}y` };
  return { score: Math.max(0.2, candidate / required), label: `${candidate}y vs ${required}y req` };
}

function categoryScore(job, resume) {
  const role = normalizeToken(job.role);
  const cat = normalizeToken(resume.category || "general");
  for (const [key, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => role.includes(a) || cat.includes(a))) {
      if (cat.includes(key) || aliases.some((a) => cat.includes(a))) return 1;
    }
  }
  if (cat === "general") return 0.6;
  return 0.4;
}

function titleRelevanceScore(job, resume) {
  const roleTokens = tokenize(job.role);
  const titleTokens = new Set(tokenize(resume.title));
  if (!roleTokens.length) return 0.5;
  let hit = 0;
  for (const t of roleTokens) {
    if (titleTokens.has(t)) hit += 1;
  }
  return Math.min(1, hit / roleTokens.length);
}

/**
 * Score one resume against a job (0–100).
 */
function scoreResumeForJob(job, resume, jobSkills) {
  const skills = jobSkills || extractJobSkills(job);
  const resumeSkills = resumeSkillSet(resume);

  const skillPart = overlapScore(skills, resumeSkills);
  const kwPart = keywordBonus(job, resume);
  const expPart = experienceScore(job, resume);
  const catPart = categoryScore(job, resume);
  const titlePart = titleRelevanceScore(job, resume);

  const weighted =
    skillPart.ratio * 0.4 +
    kwPart * 0.25 +
    expPart.score * 0.15 +
    catPart * 0.1 +
    titlePart * 0.1;

  const matchScore = Math.round(Math.min(100, Math.max(0, weighted * 100)));

  const confidence = Math.round(
    Math.min(
      100,
      Math.max(
        20,
        (skills.length ? 40 : 10) +
          skillPart.ratio * 40 +
          (resumeSkills.length ? 20 : 0)
      )
    )
  );

  return {
    matchScore,
    confidence,
    matchedSkills: skillPart.matched.slice(0, 25),
    missingSkills: skillPart.missing.slice(0, 25),
    experienceMatch: expPart.label,
    recommendedResume: {
      _id: resume._id,
      title: resume.title,
      category: resume.category,
      isDefault: resume.isDefault,
    },
    breakdown: {
      skillOverlap: Math.round(skillPart.ratio * 100),
      keywordOverlap: Math.round(kwPart * 100),
      experience: Math.round(expPart.score * 100),
      category: Math.round(catPart * 100),
      title: Math.round(titlePart * 100),
    },
  };
}

/**
 * Pick best active resume for a job.
 */
async function computeBestMatch(job) {
  const jobSkills = extractJobSkills(job);
  const resumeFilter = { isActive: true };
  if (job.userId) {
    Object.assign(resumeFilter, ownedBy(job.userId));
  }
  const resumes = await Resume.find(resumeFilter).lean().exec();
  if (!resumes.length) {
    return {
      matchScore: 0,
      confidence: 0,
      matchedSkills: [],
      missingSkills: jobSkills.slice(0, 25),
      experienceMatch: "no resumes",
      recommendedResume: null,
      recommendedResumeId: null,
      jobSkills,
    };
  }

  let best = null;
  for (const resume of resumes) {
    const scored = scoreResumeForJob(job, resume, jobSkills);
    if (!best || scored.matchScore > best.matchScore) {
      best = { ...scored, recommendedResumeId: resume._id };
    }
  }

  const defaultResume = resumes.find((r) => r.isDefault);
  if (defaultResume && best && best.matchScore < 55) {
    const boosted = scoreResumeForJob(job, defaultResume, jobSkills);
    if (boosted.matchScore >= best.matchScore) {
      best = { ...boosted, recommendedResumeId: defaultResume._id };
    }
  }

  return { ...best, jobSkills };
}

async function persistMatchOnJob(jobId, match, { emitUpdated = false } = {}) {
  const update = {
    resumeMatchScore: match.matchScore,
    confidence: match.confidence,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    experienceMatch: match.experienceMatch,
    recommendedResumeId: match.recommendedResumeId || null,
  };

  const job = await Job.findByIdAndUpdate(jobId, { $set: update }, { new: true })
    .populate("recommendedResumeId", "title category isDefault fileUrl")
    .lean()
    .exec();

  if (!job) return null;

  const payload = formatMatchResponse(job, match);
  const uid = job.userId ? String(job.userId) : null;
  emitMatchEvent(emitUpdated ? "match-updated" : "job-matched", {
    ...payload,
    userId: uid,
  });
  return payload;
}

function formatMatchResponse(job, match) {
  const rec = job.recommendedResumeId;
  const recommendedResume =
    match.recommendedResume ||
    (rec && typeof rec === "object"
      ? {
          _id: rec._id,
          title: rec.title,
          category: rec.category,
          isDefault: rec.isDefault,
          fileUrl: rec.fileUrl,
        }
      : null);

  return {
    jobId: String(job._id),
    company: job.company,
    role: job.role,
    pipelineScore: job.matchScore,
    matchScore: match.matchScore ?? job.resumeMatchScore ?? 0,
    confidence: match.confidence ?? job.confidence ?? 0,
    matchedSkills: match.matchedSkills ?? job.matchedSkills ?? [],
    missingSkills: match.missingSkills ?? job.missingSkills ?? [],
    experienceMatch: match.experienceMatch ?? job.experienceMatch ?? "",
    recommendedResume,
    recommendedResumeId: match.recommendedResumeId
      ? String(match.recommendedResumeId)
      : job.recommendedResumeId
        ? String(job.recommendedResumeId._id || job.recommendedResumeId)
        : null,
    breakdown: match.breakdown,
  };
}

async function matchJobById(jobId, { persist = true, userId = null } = {}) {
  if (!isDbReady()) {
    return { ok: false, reason: "no_db" };
  }
  if (!jobId || !mongoose.Types.ObjectId.isValid(String(jobId))) {
    const err = new Error("Invalid job id");
    err.statusCode = 400;
    throw err;
  }

  const job = await Job.findById(jobId).lean().exec();
  if (!job) {
    const err = new Error("Job not found");
    err.statusCode = 404;
    throw err;
  }
  if (userId && job.userId && String(job.userId) !== String(userId)) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }

  const match = await computeBestMatch(job);
  if (!persist) {
    return { ok: true, data: formatMatchResponse(job, match) };
  }

  const hadPrior = Boolean(job.recommendedResumeId || job.resumeMatchScore);
  const data = await persistMatchOnJob(jobId, match, { emitUpdated: hadPrior });
  logger.info("Matching", `job ${jobId} score=${match.matchScore} resume=${match.recommendedResumeId || "none"}`);
  return { ok: true, data };
}

/**
 * Re-match pending jobs after resume library changes.
 */
async function rematchPendingJobs(userId) {
  if (!isDbReady()) return { count: 0 };
  const filter = { status: "pending" };
  if (userId) Object.assign(filter, ownedBy(userId));
  const jobs = await Job.find(filter).select("_id").lean().exec();
  let count = 0;
  for (const j of jobs) {
    try {
      await matchJobById(j._id, { persist: true });
      count += 1;
    } catch (err) {
      logger.warn("Matching", `rematch ${j._id}`, err?.message || err);
    }
  }
  return { count };
}

module.exports = {
  extractJobSkills,
  scoreResumeForJob,
  computeBestMatch,
  matchJobById,
  rematchPendingJobs,
  formatMatchResponse,
};
