const fs = require("fs").promises;
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const SKILL_PATTERNS = [
  /\b(node\.?js|nodejs)\b/gi,
  /\b(react\.?js|react)\b/gi,
  /\b(express\.?js|express)\b/gi,
  /\b(mongo\s*db|mongodb)\b/gi,
  /\b(javascript|typescript)\b/gi,
  /\b(python|java|golang|go)\b/gi,
  /\b(aws|azure|gcp|docker|kubernetes)\b/gi,
  /\b(sql|postgresql|mysql|redis)\b/gi,
  /\b(next\.?js|nextjs)\b/gi,
  /\b(html|css|tailwind)\b/gi,
  /\b(git|github|gitlab|ci\/cd)\b/gi,
  /\b(rest\s*api|graphql|microservices)\b/gi,
  /\b(agile|scrum|jira)\b/gi,
];

const TECH_KEYWORDS = new Set([
  "javascript",
  "typescript",
  "python",
  "java",
  "nodejs",
  "react",
  "express",
  "mongodb",
  "postgresql",
  "mysql",
  "aws",
  "docker",
  "kubernetes",
  "nextjs",
  "graphql",
  "redis",
  "tailwind",
  "git",
]);

function normalizeToken(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function extractYearsOfExperience(text) {
  const patterns = [
    /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi,
    /experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/gi,
    /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s+experience/gi,
  ];

  let maxYears = 0;
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n > maxYears) maxYears = n;
    }
  }

  if (maxYears > 0) {
    return `${maxYears} year${maxYears === 1 ? "" : "s"}`;
  }
  return "";
}

function extractSkillsAndKeywords(text) {
  const skills = new Set();
  const keywords = new Set();

  for (const re of SKILL_PATTERNS) {
    const flags = re.flags;
    const source = re.source;
    const globalRe = new RegExp(source, flags.includes("g") ? flags : `${flags}g`);
    let m;
    while ((m = globalRe.exec(text)) !== null) {
      const raw = normalizeToken(m[0]);
      const cleaned = raw.replace(/\./g, "").replace(/\s/g, "");
      skills.add(raw);
      keywords.add(cleaned);
      if (TECH_KEYWORDS.has(cleaned)) {
        skills.add(cleaned);
      }
    }
  }

  const sectionMatch = text.match(
    /(?:skills|technical skills|technologies)[:\s]*([\s\S]{0,800})/i
  );
  if (sectionMatch) {
    const chunk = sectionMatch[1].split(/\n|•|·|,|;/).slice(0, 40);
    for (const part of chunk) {
      const t = normalizeToken(part);
      if (t.length >= 2 && t.length <= 40) {
        keywords.add(t);
        if (/^[a-z0-9+#.\s-]+$/i.test(t)) skills.add(t);
      }
    }
  }

  return {
    skills: [...skills].slice(0, 50),
    keywords: [...keywords].slice(0, 80),
  };
}

async function extractTextFromFile(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (mimeType === "application/pdf" || ext === ".pdf") {
    const data = await pdfParse(buffer);
    return data.text || "";
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  throw new Error("Unsupported file type for parsing");
}

/**
 * Parse resume file and return structured fields (never throws to caller).
 */
async function parseResumeFile(filePath, mimeType) {
  try {
    const text = await extractTextFromFile(filePath, mimeType);
    const normalized = text.replace(/\r\n/g, "\n").trim();

    if (!normalized || normalized.length < 20) {
      return {
        parsedSkills: [],
        parsedExperience: "",
        parsedKeywords: [],
        parseWarning: "Could not extract enough text from file",
      };
    }

    const { skills, keywords } = extractSkillsAndKeywords(normalized);
    const parsedExperience = extractYearsOfExperience(normalized);

    return {
      parsedSkills: skills,
      parsedExperience,
      parsedKeywords: keywords,
      parseWarning: null,
    };
  } catch (err) {
    return {
      parsedSkills: [],
      parsedExperience: "",
      parsedKeywords: [],
      parseWarning: err.message || "Parsing failed",
    };
  }
}

module.exports = { parseResumeFile, extractTextFromFile };
