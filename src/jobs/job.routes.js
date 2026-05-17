const express = require("express");
const jobController = require("./job.controller");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/stats", asyncHandler(jobController.getJobStats));
router.get("/", asyncHandler(jobController.getJobs));
router.get("/:id", asyncHandler(jobController.getJobById));
router.patch("/:id/approve", asyncHandler(jobController.approveJob));
router.patch("/:id/reject", asyncHandler(jobController.rejectJob));
router.delete("/:id", asyncHandler(jobController.deleteJob));

module.exports = router;
