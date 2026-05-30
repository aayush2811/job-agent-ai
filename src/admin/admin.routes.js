const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { requireRole } = require("../auth/auth.middleware");
const adminController = require("./admin.controller");

const router = express.Router();

router.get("/job-audit", requireRole("admin"), asyncHandler(adminController.jobAudit));
router.get(
  "/missing-notifications",
  requireRole("admin"),
  asyncHandler(adminController.missingNotifications)
);
router.post(
  "/replay-notifications",
  requireRole("admin"),
  asyncHandler(adminController.replayNotifications)
);
router.get(
  "/extraction-debug",
  requireRole("admin"),
  asyncHandler(adminController.extractionDebug)
);

module.exports = router;
