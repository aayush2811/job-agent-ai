const { getJobAudit } = require("./jobAudit.service");
const {
  getMissingNotifications,
  replayNotifications,
} = require("./notificationAudit.service");

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

module.exports = {
  jobAudit,
  missingNotifications,
  replayNotifications: replayNotificationsHandler,
};
