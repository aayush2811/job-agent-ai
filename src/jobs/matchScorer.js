const profile = require("../config/profile");

const calculateMatchScore = (job) => {
  let score = 0;

  // Skills Match
  job.skills.forEach((skill) => {
    if (
      profile.skills.some(
        (mySkill) =>
          mySkill.toLowerCase() === skill.toLowerCase()
      )
    ) {
      score += 10;
    }
  });

  // Role Match
  if (
    profile.preferredRoles.some((role) =>
      job.role.toLowerCase().includes(role.toLowerCase())
    )
  ) {
    score += 30;
  }

  // Location Match
  if (
    profile.preferredLocations.some((location) =>
      job.location
        .toLowerCase()
        .includes(location.toLowerCase())
    )
  ) {
    score += 20;
  }

  if (score > 100) {
    score = 100;
  }

  return score;
};

module.exports = calculateMatchScore;