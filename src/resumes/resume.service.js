const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
const Resume = require("./resume.model");
const { parseResumeFile } = require("./resume.parser");
const { UPLOAD_DIR } = require("./multer.config");
const { emitResumeEvent } = require("../sockets/resumeEvents");
const { rematchPendingJobs } = require("../matching/matching.service");
const { ownedBy } = require("../middleware/ownership");
const User = require("../users/user.model");
const {
  checkResumeUploadLimit,
  recordResumeUpload,
} = require("../users/usageLimits");
const logger = require("../utils/logger");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertValidObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw httpError(400, "Invalid resume id");
  }
}

function buildFileUrl(resumeId) {
  return `/api/resumes/${resumeId}/download`;
}

async function assertResumeOwner(id, userId) {
  assertValidObjectId(id);
  const resume = await Resume.findOne({ _id: id, ...ownedBy(userId) }).exec();
  if (!resume) throw httpError(404, "Resume not found");
  return resume;
}

function toPublicResume(doc) {
  if (!doc) return null;
  return typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
}

async function clearOtherDefaults(exceptId = null, userId = null) {
  const filter = { isDefault: true, ...ownedBy(userId) };
  if (exceptId) filter._id = { $ne: exceptId };
  await Resume.updateMany(filter, { $set: { isDefault: false } });
}

async function runParse(resume) {
  const filePath = path.join(UPLOAD_DIR, resume.filename);
  logger.debug("Resume", `parsing started id=${resume._id}`);

  try {
    const parsed = await parseResumeFile(filePath, resume.mimeType);
    resume.parsedSkills = parsed.parsedSkills;
    resume.parsedExperience = parsed.parsedExperience;
    resume.parsedKeywords = parsed.parsedKeywords;
    resume.uploadStatus = "completed";
    resume.parseError = parsed.parseWarning || null;
    await resume.save();
    logger.debug(
      "Resume",
      `parsing completed id=${resume._id} skills=${parsed.parsedSkills.length}`
    );
    return resume;
  } catch (err) {
    logger.warn("Resume", `parsing save failed id=${resume._id}`, err?.message || err);
    resume.uploadStatus = "failed";
    resume.parseError = err.message || "Parsing failed";
    await resume.save();
    return resume;
  }
}

async function uploadResume(file, body = {}, userId) {
  if (!file) {
    throw httpError(400, "Resume file is required");
  }
  if (!userId) throw httpError(401, "Authentication required");

  const user = await User.findById(userId);
  if (!user) throw httpError(404, "User not found");
  await checkResumeUploadLimit(user);

  const title =
    (body.title && String(body.title).trim()) ||
    path.basename(file.originalname, path.extname(file.originalname));

  const tags = parseTags(body.tags);
  const category = body.category ? String(body.category).trim() : "general";
  const setAsDefault = body.isDefault === true || body.isDefault === "true";

  let resume = await Resume.create({
    title,
    filename: file.filename,
    originalName: file.originalname,
    fileUrl: "/api/resumes/pending/download",
    fileSize: file.size,
    mimeType: file.mimetype,
    uploadedAt: new Date(),
    tags,
    category,
    uploadStatus: "processing",
    isDefault: false,
    isActive: true,
    userId,
  });

  resume.fileUrl = buildFileUrl(resume._id);
  await resume.save();

  logger.info(
    "Resume",
    `upload saved id=${resume._id} file=${file.filename} size=${file.size}`
  );

  resume = await runParse(resume);

  await recordResumeUpload(user);

  const count = await Resume.countDocuments({ isActive: true, ...ownedBy(userId) });
  if (setAsDefault || count === 1) {
    await setDefaultResume(resume._id.toString(), userId);
    resume = await Resume.findById(resume._id);
  }

  const payload = toPublicResume(resume);
  emitResumeEvent("resume-uploaded", { resume: payload, userId: String(userId) });
  rematchPendingJobs(userId).catch((err) =>
    logger.warn("Resume", "rematch pending jobs", err?.message || err)
  );
  return payload;
}

function parseTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

async function getResumes(query = {}, userId) {
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(String(query.limit || 20), 10) || 20),
    100
  );
  const skip = (page - 1) * limit;

  const filter = { ...ownedBy(userId) };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }
  if (query.category) filter.category = String(query.category);
  if (query.tag) filter.tags = String(query.tag);
  if (query.uploadStatus) filter.uploadStatus = String(query.uploadStatus);

  const [total, resumes] = await Promise.all([
    Resume.countDocuments(filter),
    Resume.find(filter)
      .sort({ isDefault: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    resumes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

async function getResumeById(id, userId) {
  assertValidObjectId(id);
  const resume = await Resume.findOne({ _id: id, ...ownedBy(userId) }).lean();
  if (!resume) throw httpError(404, "Resume not found");
  return resume;
}

async function streamResumeFile(id, userId) {
  const resume = await assertResumeOwner(id, userId);
  const filePath = path.join(UPLOAD_DIR, resume.filename);
  return { resume, filePath };
}

async function updateResume(id, updates, userId) {
  assertValidObjectId(id);
  const resume = await assertResumeOwner(id, userId);

  const allowed = ["title", "tags", "category", "isActive"];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === "tags") {
        resume.tags = parseTags(updates.tags);
      } else if (key === "isActive") {
        resume.isActive = Boolean(
          updates.isActive === true || updates.isActive === "true"
        );
      } else {
        resume[key] = updates[key];
      }
    }
  }

  await resume.save();
  const payload = toPublicResume(await Resume.findById(id).lean());
  emitResumeEvent("resume-updated", { resume: payload, userId: String(userId) });
  logger.debug("Resume", `updated id=${id}`);
  return payload;
}

async function deleteResume(id, userId) {
  assertValidObjectId(id);
  const resume = await assertResumeOwner(id, userId);

  const filePath = path.join(UPLOAD_DIR, resume.filename);
  try {
    await fs.unlink(filePath);
    logger.debug("Resume", `file deleted ${resume.filename}`);
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger.warn("Resume", "file delete error", err?.message || err);
    }
  }

  const wasDefault = resume.isDefault;
  await resume.deleteOne();

  if (wasDefault) {
    const next = await Resume.findOne({ isActive: true, ...ownedBy(userId) }).sort({
      createdAt: -1,
    });
    if (next) {
      await setDefaultResume(next._id.toString(), userId);
    }
  }

  emitResumeEvent("resume-deleted", { id: id.toString(), userId: String(userId) });
  logger.info("Resume", `deleted id=${id}`);
  return { id: id.toString(), deleted: true };
}

async function setDefaultResume(id, userId) {
  assertValidObjectId(id);
  const resume = await assertResumeOwner(id, userId);
  if (!resume.isActive) {
    throw httpError(400, "Cannot set inactive resume as default");
  }

  await clearOtherDefaults(resume._id, userId);
  resume.isDefault = true;
  await resume.save();

  const payload = toPublicResume(await Resume.findById(id).lean());
  emitResumeEvent("resume-updated", { resume: payload, userId: String(userId) });
  logger.info("Resume", `default set id=${id}`);
  rematchPendingJobs(userId).catch((err) =>
    logger.warn("Resume", "rematch pending jobs", err?.message || err)
  );
  return payload;
}

async function getDefaultResume(userId) {
  return Resume.findOne({ isDefault: true, isActive: true, ...ownedBy(userId) }).lean();
}

async function linkResumeToApplication(resumeId) {
  assertValidObjectId(resumeId);
  await Resume.findByIdAndUpdate(resumeId, { $inc: { applicationCount: 1 } });
}

module.exports = {
  uploadResume,
  getResumes,
  getResumeById,
  streamResumeFile,
  updateResume,
  deleteResume,
  setDefaultResume,
  getDefaultResume,
  linkResumeToApplication,
};
