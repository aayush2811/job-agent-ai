const { getJobAudit } = require("./jobAudit.service");
const {
  getMissingNotifications,
  replayNotifications,
} = require("./notificationAudit.service");
const { getRecentExtractionAttempts } = require("../services/extractionAudit.service");

async function jobAudit(req, res) {
  const data = await getJobAudit(req.user.id);
  res.json({ success: true, data });
}

async function missingNotifications(req, res) {
  const data = await getMissingNotifications();
  res.json({ success: true, data });
}

async function replayNotificationsHandler(req, res) {
  const data = await replayNotifications();
  res.json({ success: true, data });
}

async function extractionDebug(req, res) {
  res.json({
    success: true,
    data: {
      attempts: getRecentExtractionAttempts(20),
      requiredFields: ["company", "role"],
      optionalFields: ["email", "applyUrl", "skills", "experience", "location"],
    },
  });
}

module.exports = {
  jobAudit,
  missingNotifications,
  replayNotifications: replayNotificationsHandler,
  extractionDebug,
};
