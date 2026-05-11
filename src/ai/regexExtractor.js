const extractWithRegex = (text) => {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

  const emails = text.match(emailRegex);

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
  ];

  knownSkills.forEach((skill) => {
    if (text.toLowerCase().includes(skill.toLowerCase())) {
      skills.push(skill);
    }
  });

  const locationMatch = text.match(/Location:\s*(.*)/i);
  const companyMatch =
    text.match(/Company\s*:\s*(.+)/i) || text.match(/at\s+([A-Za-z0-9 .&-]+)/i);
  const roleMatch =
    text.match(/Hiring\s+(.+)/i) || text.match(/Position\s*:\s*(.+)/i);
  const experienceMatch = text.match(/Experience:\s*(.*)/i);
  const cleanText = (value) => {
    if (!value) return "";

    return value
      .replace(/\n/g, "")
      .replace(/\|/g, "")
      .replace(/📍|🌟|🚀/g, "")
      .trim();
  };

  return {
    company: cleanText(companyMatch?.[1]),

    role: cleanText(roleMatch?.[1]),

    location: locationMatch?.[1]?.trim() || "",

    email: emails?.[0] || "",

    skills,

    experience: experienceMatch?.[1]?.trim() || "",
  };
};

module.exports = extractWithRegex;
