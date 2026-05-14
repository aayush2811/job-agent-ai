const jobService = require("./job.service");

function sendError(res, statusCode, message) {
  res.status(statusCode).json({
    success: false,
    message,
  });
}

async function getJobs(req, res) {
  try {
    const data = await jobService.getJobs(req.query);
    res.json({
      success: true,
      message: "Jobs fetched",
      data,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error("[API] GET /jobs:", err.message);
    sendError(res, code, err.message || "Failed to list jobs");
  }
}

async function getJobById(req, res) {
  try {
    const job = await jobService.getJobById(req.params.id);
    res.json({
      success: true,
      message: "Job fetched",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error("[API] GET /jobs/:id:", err.message);
    sendError(res, code, err.message || "Failed to fetch job");
  }
}

async function approveJob(req, res) {
  try {
    const job = await jobService.approveJob(req.params.id);
    res.json({
      success: true,
      message: "Job approved",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error("[API] PATCH /jobs/:id/approve:", err.message);
    sendError(res, code, err.message || "Failed to approve job");
  }
}

async function rejectJob(req, res) {
  try {
    const job = await jobService.rejectJob(req.params.id);
    res.json({
      success: true,
      message: "Job rejected",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error("[API] PATCH /jobs/:id/reject:", err.message);
    sendError(res, code, err.message || "Failed to reject job");
  }
}

async function deleteJob(req, res) {
  try {
    const job = await jobService.deleteJob(req.params.id);
    res.json({
      success: true,
      message: "Job deleted",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error("[API] DELETE /jobs/:id:", err.message);
    sendError(res, code, err.message || "Failed to delete job");
  }
}

async function getJobStats(req, res) {
  try {
    const stats = await jobService.getJobStats();
    res.json({
      success: true,
      message: "Job stats fetched",
      data: stats,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    console.error("[API] GET /jobs/stats:", err.message);
    sendError(res, code, err.message || "Failed to fetch job stats");
  }
}

module.exports = {
  getJobs,
  getJobById,
  approveJob,
  rejectJob,
  deleteJob,
  getJobStats,
};
