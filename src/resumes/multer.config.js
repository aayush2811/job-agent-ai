const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "resumes");
const MAX_FILE_SIZE =
  parseInt(process.env.RESUME_MAX_FILE_SIZE_MB || "10", 10) * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXT = new Set([".pdf", ".docx"]);

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);
    const unique = `${Date.now()}-${uuidv4().slice(0, 8)}-${safeBase}${ext}`;
    cb(null, unique);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
    const err = new Error("Only PDF and DOCX files are allowed");
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

function multerErrorHandler(err, req, res, next) {
  if (!err) return next();

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: `File too large. Max ${process.env.RESUME_MAX_FILE_SIZE_MB || 10}MB`,
      data: null,
    });
  }

  if (err.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({
      success: false,
      message: err.message,
      data: null,
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.message,
      data: null,
    });
  }

  return res.status(400).json({
    success: false,
    message: err.message || "Upload failed",
    data: null,
  });
}

module.exports = {
  upload,
  multerErrorHandler,
  ensureUploadDir,
  UPLOAD_DIR,
  MAX_FILE_SIZE,
};
