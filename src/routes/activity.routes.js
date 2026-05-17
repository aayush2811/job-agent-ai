const express = require("express");
const ActivityLog = require("../models/activityLog.model");
const { isDbReady } = require("../utils/dbGuard");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    if (!isDbReady()) {
      return res.json({ success: true, data: { items: [], warning: "database_unavailable" } });
    }
    const items = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    res.json({ success: true, data: { items, count: items.length } });
  })
);

module.exports = router;
