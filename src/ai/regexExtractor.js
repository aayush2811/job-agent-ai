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
  const companyMatch = text.match(/Company:\s*(.*)/i);

  const roleMatch = text.match(/Hiring\s+(.*?)(\n|$)/i);

  const experienceMatch = text.match(/Experience:\s*(.*)/i);
  return {
    company: companyMatch?.[1]?.trim() || "",

    role: roleMatch?.[1]?.trim() || "",

    location: locationMatch?.[1]?.trim() || "",

    email: emails?.[0] || "",

    skills,

    experience: experienceMatch?.[1]?.trim() || "",
  };
};

module.exports = extractWithRegex;
