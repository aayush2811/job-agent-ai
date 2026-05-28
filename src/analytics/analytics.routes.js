const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const analyticsController = require("./analytics.controller");

const router = express.Router();

router.get("/dashboard", asyncHandler(analyticsController.getDashboard));
router.get("/applications", asyncHandler(analyticsController.getApplications));
router.get("/pipeline", asyncHandler(analyticsController.getPipeline));
router.get("/realtime", asyncHandler(analyticsController.getRealtime));
router.get("/platforms", asyncHandler(analyticsController.getPlatforms));

module.exports = router;
