const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const Application = require("../models/application.model");
const { ownedBy } = require("../middleware/ownership");
const { isDbReady } = require("../utils/dbGuard");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 10), 10) || 10));
    const skip = (page - 1) * limit;

    if (!isDbReady()) {
      return res.json({
        success: true,
        message: "Applications fetched",
        data: {
          applications: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        },
      });
    }

    const filter = ownedBy(req.user.id);
    const [applications, total] = await Promise.all([
      Application.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("jobId", "company role status matchScore resumeMatchScore")
        .lean(),
      Application.countDocuments(filter),
    ]);

    res.json({
      success: true,
      message: "Applications fetched",
      data: {
        applications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      },
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isDbReady()) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
        data: null,
      });
    }

    const app = await Application.findOne({
      _id: req.params.id,
      ...ownedBy(req.user.id),
    })
      .populate("jobId")
      .lean();

    if (!app) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
        data: null,
      });
    }

    res.json({ success: true, message: "Application", data: { application: app } });
  })
);

module.exports = router;
