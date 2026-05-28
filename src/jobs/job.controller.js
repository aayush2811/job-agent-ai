const jobService = require("./job.service");

function sendError(res, statusCode, message) {
  res.status(statusCode).json({
    success: false,
    message,
    data: null,
  });
}

async function getJobs(req, res) {
  const data = await jobService.getJobs(req.query, req.user.id);
  res.json({
    success: true,
    message: "Jobs fetched",
    data,
  });
}

async function getJobById(req, res) {
  try {
    const job = await jobService.getJobById(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Job fetched",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    sendError(res, code, err.message || "Failed to fetch job");
  }
}

async function approveJob(req, res) {
  try {
    const job = await jobService.approveJob(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Job approved",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    sendError(res, code, err.message || "Failed to approve job");
  }
}

async function rejectJob(req, res) {
  try {
    const job = await jobService.rejectJob(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Job rejected",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    sendError(res, code, err.message || "Failed to reject job");
  }
}

async function deleteJob(req, res) {
  try {
    const job = await jobService.deleteJob(req.params.id, req.user.id);
    res.json({
      success: true,
      message: "Job deleted",
      data: { job },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    sendError(res, code, err.message || "Failed to delete job");
  }
}

async function getJobStats(req, res) {
  const stats = await jobService.getJobStats(req.user.id);
  res.json({
    success: true,
    message: "Job stats fetched",
    data: {
      total: stats.total ?? stats.totalJobs ?? 0,
      approved: stats.approved ?? 0,
      pending: stats.pending ?? 0,
      rejected: stats.rejected ?? 0,
      autoApplied: stats.autoApplied ?? 0,
      failed: stats.failed ?? 0,
    },
  });
}

module.exports = {
  getJobs,
  getJobById,
  approveJob,
  rejectJob,
  deleteJob,
  getJobStats,
};
