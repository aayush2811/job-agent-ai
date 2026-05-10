const jobKeywords = [
    "hiring",
    "developer",
    "job",
    "opening",
    "vacancy",
    "react",
    "node",
    "mern",
    "backend",
    "frontend",
    "full stack",
    "javascript",
    "walk in",
    "urgent hiring",
    "software engineer",
    "apply",
    "cv",
    "resume",
  ];
  
  const isJobRelated = (message) => {
    const lowerCaseMessage = message.toLowerCase();
  
    return jobKeywords.some((keyword) =>
      lowerCaseMessage.includes(keyword)
    );
  };
  
  module.exports = isJobRelated;