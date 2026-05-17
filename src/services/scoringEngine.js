const profile = require("../config/profile");

const MIN_YEARS = profile.targetExperienceBand?.min ?? 0;
const MAX_YEARS = profile.targetExperienceBand?.max ?? 15;
const MIN_SALARY_LPA =
  profile.minSalaryLpa !== undefined ? profile.minSalaryLpa : 0;

/**
 * @param {string} text
 * @returns {number|null}
 */
function extractSalaryLpa(text) {
  if (!text) return null;
  const t = text.replace(/,/g, "").toLowerCase();
  const cr = t.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/);
  if (cr) {
    return parseFloat(cr[1]) * 100;
  }
  const lpa = t.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lac)/);
  if (lpa) {
    return parseFloat(lpa[1]);
  }
  const plain = t.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/i);
  if (plain) {
    return (parseFloat(plain[1]) + parseFloat(plain[2])) / 2 / 100000;
  }
  return null;
}

/**
 * @param {string} exp
 * @returns {number|null}
 */
function extractYears(exp) {
  if (!exp) return null;
  const m = String(exp).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Full scoring with breakdown (0–100) + reasoning lines + recommendation.
 * @param {object} job - extracted fields (role, skills, location, experience, etc.)
 * @param {string} [fullText] - original message for salary / keyword scan
 */
function scoreJob(job, fullText = "") {
  const reasoning = [];
  let score = 0;
  const roleLower = (job.role || "").toLowerCase();
  const locLower = (job.location || "").toLowerCase();
  const textBlob = `${fullText} ${job.role || ""} ${job.location || ""}`.toLowerCase();

  const skills = Array.isArray(job.skills) ? job.skills : [];
  let skillHits = 0;
  skills.forEach((skill) => {
    const s = String(skill).toLowerCase();
    if (profile.skills.some((mine) => mine.toLowerCase() === s)) {
      skillHits += 1;
      score += 7;
      reasoning.push(`Skill match: ${skill}`);
    }
  });
  if (skillHits === 0) {
    reasoning.push("No direct skill overlap with profile list");
  }

  if (profile.preferredRoles.some((r) => roleLower.includes(r.toLowerCase()))) {
    score += 28;
    reasoning.push("Preferred role family matched");
  }

  if (
    profile.preferredLocations.some((loc) => locLower.includes(loc.toLowerCase()))
  ) {
    score += 18;
    reasoning.push(`Location preference: ${job.location || "match"}`);
  }

  const isRemote =
    /\bremote|wfh|work from home\b/i.test(textBlob) || locLower.includes("remote");
  if (isRemote) {
    const pref = profile.remotePreference || "preferred";
    if (pref === "only") {
      score += 20;
      reasoning.push("Remote role (required for your profile)");
    } else {
      score += 12;
      reasoning.push("Remote / hybrid signal in post");
    }
  }

  const salary = job.salaryLpa != null ? job.salaryLpa : extractSalaryLpa(fullText);
  if (salary != null && salary > 0) {
    if (salary >= MIN_SALARY_LPA) {
      score += 10;
      reasoning.push(`Salary band OK (~${salary} LPA vs min ${MIN_SALARY_LPA})`);
    } else {
      score -= 5;
      reasoning.push(`Salary below preferred min (${salary} < ${MIN_SALARY_LPA} LPA)`);
    }
  } else {
    reasoning.push("No clear salary in post — neutral");
  }

  const years = extractYears(job.experience);
  if (years != null) {
    if (years >= MIN_YEARS && years <= MAX_YEARS) {
      score += 15;
      reasoning.push(`Experience ${years}y in target band (${MIN_YEARS}-${MAX_YEARS})`);
    } else if (years < MIN_YEARS) {
      score += 5;
      reasoning.push(`Experience ${years}y — junior band`);
    } else {
      score += 3;
      reasoning.push(`Experience ${years}y — above preferred band`);
    }
  }

  const keywords = profile.pipelineKeywords || [];
  keywords.forEach((kw) => {
    if (textBlob.includes(String(kw).toLowerCase())) {
      score += 4;
      reasoning.push(`Keyword: ${kw}`);
    }
  });

  score = Math.max(0, Math.min(100, Math.round(score)));

  let recommendation = "manual_review";
  if (score >= 90) {
    recommendation = "auto_apply";
  } else if (score >= 75) {
    recommendation = "high_priority_approve";
  } else if (score >= 60) {
    recommendation = "consider";
  }

  return {
    score,
    reasoning,
    recommendation,
    breakdown: {
      skillHits,
      remote: Boolean(isRemote),
      salaryParsed: salary,
      yearsParsed: years,
    },
  };
}

module.exports = { scoreJob, extractSalaryLpa };
