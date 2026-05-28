const matchingService = require("./matching.service");

function sendError(res, statusCode, message) {
  res.status(statusCode).json({ success: false, message, data: null });
}

async function getJobMatch(req, res) {
  try {
    const result = await matchingService.matchJobById(req.params.jobId, {
      persist: true,
      userId: req.user.id,
    });
    res.json({
      success: true,
      message: "Job match computed",
      data: result.data,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    sendError(res, code, err.message || "Match failed");
  }
}

module.exports = { getJobMatch };
