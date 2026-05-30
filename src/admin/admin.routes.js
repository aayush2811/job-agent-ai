const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { requireRole } = require("../auth/auth.middleware");
const adminController = require("./admin.controller");

const router = express.Router();

router.get("/job-audit", requireRole("admin"), asyncHandler(adminController.jobAudit));

module.exports = router;
