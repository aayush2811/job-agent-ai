const path = require("path");
const fs = require("fs");
const resumeService = require("./resume.service");
const logger = require("../utils/logger");

function sendError(res, statusCode, message) {
  res.status(statusCode).json({ success: false, message, data: null });
}

async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return sendError(res, 400, "Resume file is required (PDF or DOCX)");
    }
    const resume = await resumeService.uploadResume(req.file, req.body, req.user.id);
    res.status(201).json({
      success: true,
      message: "Resume uploaded",
      data: { resume },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    logger.error("Resume", `POST /upload ${err.message}`);
    sendError(res, code, err.message || "Upload failed");
  }
}

async function getResumes(req, res) {
  try {
    const data = await resumeService.getResumes(req.query, req.user.id);
    res.json({
      success: true,
      message: "Resumes fetched",
      data,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    logger.error("Resume", `GET / ${err.message}`);
    if (code >= 500) {
      return res.status(200).json({
        success: true,
        message: "Resumes fetched (empty fallback)",
        data: {
          resumes: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        },
      });
    }
    sendError(res, code, err.message || "Failed to list resumes");
  }
}

async function downloadResume(req, res) {
  try {
    const { resume, filePath } = await resumeService.streamResumeFile(
      req.params.id,
      req.user.id
    );
    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, "File not found");
    }
    const ext = path.extname(resume.filename).toLowerCase();
    if (ext === ".pdf") res.type("application/pdf");
    else if (ext === ".docx") {
      res.type(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    const code = err.statusCode || 500;
    sendError(res, code, err.message || "Download failed");
  }
}

async function getResumeById(req, res) {
  try {
    const resume = await resumeService.getResumeById(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Resume fetched",
      data: { resume },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    logger.error("Resume", `GET /:id ${err.message}`);
    sendError(res, code, err.message || "Failed to fetch resume");
  }
}

async function updateResume(req, res) {
  try {
    const resume = await resumeService.updateResume(req.params.id, req.body, req.user.id);
    res.json({
      success: true,
      message: "Resume updated",
      data: { resume },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    logger.error("Resume", `PATCH /:id ${err.message}`);
    sendError(res, code, err.message || "Failed to update resume");
  }
}

async function deleteResume(req, res) {
  try {
    const result = await resumeService.deleteResume(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Resume deleted",
      data: result,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    logger.error("Resume", `DELETE /:id ${err.message}`);
    sendError(res, code, err.message || "Failed to delete resume");
  }
}

async function setDefaultResume(req, res) {
  try {
    const resume = await resumeService.setDefaultResume(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Default resume set",
      data: { resume },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    logger.error("Resume", `POST /:id/default ${err.message}`);
    sendError(res, code, err.message || "Failed to set default resume");
  }
}

module.exports = {
  uploadResume,
  getResumes,
  downloadResume,
  getResumeById,
  updateResume,
  deleteResume,
  setDefaultResume,
};
