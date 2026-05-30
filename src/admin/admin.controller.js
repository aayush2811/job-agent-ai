const { getJobAudit } = require("./jobAudit.service");

async function jobAudit(req, res) {
  const data = await getJobAudit(req.user.id);
  res.json({ success: true, data });
}

module.exports = { jobAudit };
