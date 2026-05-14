const express = require("express");
const jobController = require("./job.controller");

const router = express.Router();

router.get("/stats", jobController.getJobStats);
router.get("/", jobController.getJobs);
router.get("/:id", jobController.getJobById);
router.patch("/:id/approve", jobController.approveJob);
router.patch("/:id/reject", jobController.rejectJob);
router.delete("/:id", jobController.deleteJob);

module.exports = router;
