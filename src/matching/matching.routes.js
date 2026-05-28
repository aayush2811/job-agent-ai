const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const matchingController = require("./matching.controller");

const router = express.Router();

router.get("/job/:jobId", asyncHandler(matchingController.getJobMatch));

module.exports = router;
