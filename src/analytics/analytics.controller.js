const analyticsService = require("./analytics.service");

function sendSuccess(res, data, message) {
  res.json({
    success: true,
    message: message || "OK",
    data,
  });
}

async function getDashboard(req, res) {
  console.log("[Analytics] dashboard route hit");
  const range = req.query.range || "7d";
  const data = await analyticsService.getDashboardAnalytics(range);
  sendSuccess(res, data, "Dashboard analytics");
}

async function getApplications(req, res) {
  console.log("[Analytics] applications route hit");
  const range = req.query.range || "7d";
  const data = await analyticsService.getApplicationsAnalytics(range);
  sendSuccess(res, data, "Application analytics");
}

async function getPipeline(req, res) {
  console.log("[Analytics] pipeline route hit");
  const data = await analyticsService.getPipelineAnalytics();
  sendSuccess(res, data, "Pipeline analytics");
}

async function getRealtime(req, res) {
  console.log("[Analytics] realtime route hit");
  const data = await analyticsService.getRealtimeAnalytics();
  sendSuccess(res, data, "Realtime analytics");
}

module.exports = {
  getDashboard,
  getApplications,
  getPipeline,
  getRealtime,
};
