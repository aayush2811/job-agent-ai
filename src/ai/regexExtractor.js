const extractWithRegex = (text) => {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/gi;

  const emails = text.match(emailRegex) || [];
  const urls = text.match(urlRegex) || [];

  const skills = [];

  const knownSkills = [
    "React",
    "Node.js",
    "MongoDB",
    "AWS",
    "Next.js",
    "Express",
    "PostgreSQL",
    "Docker",
    "Redis",
    "Socket.IO",
    "Python",
    "Java",
    "TypeScript",
    "JavaScript",
    "Kubernetes",
  ];

  knownSkills.forEach((skill) => {
    if (text.toLowerCase().includes(skill.toLowerCase())) {
      skills.push(skill);
    }
  });

  const locationMatch =
    text.match(/Location\s*:\s*(.+)/i) ||
    text.match(/📍\s*(.+)/i) ||
    text.match(/(?:based in|work location)\s*[:\-]?\s*(.+)/i);

  const atForMatch = text.match(/\bat\s+([A-Za-z0-9.&'-]{2,50})\s+for\s+(.+)/i);

  const companyMatch =
    text.match(/Company\s*:\s*(.+)/i) ||
    text.match(/Organisation\s*:\s*(.+)/i) ||
    text.match(/Organization\s*:\s*(.+)/i) ||
    (atForMatch ? [null, atForMatch[1]] : null) ||
    text.match(/\bat\s+([A-Za-z0-9 .&'-]{2,50})(?:\s|,|\.|\n|$)/i);

  const roleMatch =
    text.match(/(?:Role|Position|Job Title|Opening|Hiring for|Hiring)\s*[:\-]?\s*(.+)/i) ||
    (atForMatch ? [null, atForMatch[2]] : null) ||
    text.match(/(?:looking for|require)\s+(?:a\s+)?([A-Za-z0-9 /\-&.+]{3,80})/i);

  const experienceMatch =
    text.match(/Experience\s*:\s*(.+)/i) ||
    text.match(/(\d+\s*[-–+]?\s*\d*\s*(?:\+)?\s*years?)/i);

  const labeledApply = text.match(
    /(?:apply|application|link)\s*[:\-]?\s*(https?:\/\/[^\s<>"')\]]+)/i
  );
  const applyUrlRaw =
    labeledApply?.[1] ||
    urls.find((u) => /linkedin|greenhouse|lever|workday|ashby|jobs\./i.test(u)) ||
    urls[0] ||
    "";
  const applyUrl = applyUrlRaw ? String(applyUrlRaw).replace(/[)\],.]+$/, "") : "";

  const cleanText = (value) => {
    if (!value) return "";
    return value
      .replace(/\n/g, " ")
      .replace(/\|/g, " ")
      .replace(/📍|🌟|🚀|💼|🏢|✅|⚠️/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const company = cleanText(companyMatch?.[1]);
  let role = cleanText(roleMatch?.[1]);

  // Trim role at common delimiters
  if (role) {
    role = role.split(/\||•|·|\(|\[/)[0].trim();
    if (role.length > 120) role = role.slice(0, 120).trim();
  }

  return {
    company,
    role,
    location: cleanText(locationMatch?.[1]),
    email: emails[0] || "",
    applyUrl,
    skills,
    experience: cleanText(experienceMatch?.[1]),
  };
};

module.exports = extractWithRegex;
