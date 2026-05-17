const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

const emptyList = (query) => {
  const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 10), 10) || 10));
  return {
    applications: [],
    pagination: { page, limit, total: 0, totalPages: 0 },
  };
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      message: "Applications fetched",
      data: emptyList(req.query),
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.status(404).json({
      success: false,
      message: "Application not found",
      data: null,
    });
  })
);

module.exports = router;
