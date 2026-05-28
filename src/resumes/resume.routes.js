const express = require("express");
const resumeController = require("./resume.controller");
const { upload, multerErrorHandler } = require("./multer.config");
const { uploadRateLimiter } = require("../security/rateLimits");

const router = express.Router();

router.post(
  "/upload",
  uploadRateLimiter,
  upload.single("resume"),
  multerErrorHandler,
  resumeController.uploadResume
);

router.get("/", resumeController.getResumes);
router.get("/:id/download", resumeController.downloadResume);
router.get("/:id", resumeController.getResumeById);
router.patch("/:id", resumeController.updateResume);
router.delete("/:id", resumeController.deleteResume);
router.post("/:id/default", resumeController.setDefaultResume);

module.exports = router;
