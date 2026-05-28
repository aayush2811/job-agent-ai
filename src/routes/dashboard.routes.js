const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const jobService = require("../jobs/job.service");

const router = express.Router();

const EMPTY_ACTIVITY = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
const EMPTY_ANALYTICS = {
  jobsByDay: [],
  applicationsByDay: [],
  avgMatchScoreByDay: [],
  funnel: { pending: 0, approved: 0, applied: 0, rejected: 0 },
};

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await jobService.getJobStats(req.user.id);
    res.json({
      success: true,
      data: {
        total: stats.total ?? 0,
        approved: stats.approved ?? 0,
        pending: stats.pending ?? 0,
        rejected: stats.rejected ?? 0,
        autoApplied: stats.autoApplied ?? 0,
        failed: stats.failed ?? 0,
      },
    });
  })
);

router.get(
  "/activity",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20), 10) || 20));
    res.json({
      success: true,
      data: {
        ...EMPTY_ACTIVITY,
        pagination: { page, limit, total: 0, totalPages: 0 },
      },
    });
  })
);

router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const stats = await jobService.getJobStats(req.user.id);
    res.json({
      success: true,
      data: {
        ...EMPTY_ANALYTICS,
        summary: stats,
        range: req.query.range || "7d",
      },
    });
  })
);

module.exports = router;
