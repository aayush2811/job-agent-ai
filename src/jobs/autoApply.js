const applicationEngine = require("../services/applicationEngine.service");

/**
 * @param {import('mongoose').Document} job
 */
async function autoApply(job) {
  return applicationEngine.applyAuto(job);
}

module.exports = autoApply;
