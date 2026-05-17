const profile = {
    preferredRoles: [
      "Backend Developer",
      "Full Stack Developer",
      "MERN Developer",
      "Node.js Developer",
    ],

    skills: [
      "Node.js",
      "React",
      "Next.js",
      "MongoDB",
      "Express",
      "AWS",
      "Socket.IO",
      "PostgreSQL",
    ],

    preferredLocations: ["Ahmedabad", "Remote"],

    /** Minimum expected CTC in LPA for salary weighting */
    minSalaryLpa: 0,

    /** Preferred experience band (years) */
    targetExperienceBand: { min: 1, max: 8 },

    /** preferred | only | any */
    remotePreference: "preferred",

    /** Extra keyword boosts in full job text */
    pipelineKeywords: ["typescript", "microservices", "kubernetes", "docker", "graphql"],
};
  
  module.exports = profile;