const { scoreJob } = require("../services/scoringEngine");

const calculateMatchScore = (job, fullText = "") => {
  return scoreJob(job, fullText).score;
};

module.exports = calculateMatchScore;
