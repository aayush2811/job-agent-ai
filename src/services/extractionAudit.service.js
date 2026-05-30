/**
 * In-memory ring buffer of recent extraction attempts (production debug).
 */
const MAX_ATTEMPTS = 20;
/** @type {Array<Record<string, unknown>>} */
const attempts = [];

function hasText(value) {
  return Boolean(value && String(value).trim());
}

function normalizeParsed(extractedData = {}) {
  return {
    company: extractedData.company || "",
    role: extractedData.role || "",
    location: extractedData.location || "",
    email: extractedData.email || "",
    applyUrl: extractedData.applyUrl || "",
    skills: Array.isArray(extractedData.skills) ? extractedData.skills : [],
    experience: extractedData.experience || "",
  };
}

function getMissingRequiredFields(extractedData) {
  const missing = [];
  if (!hasText(extractedData?.company)) missing.push("company");
  if (!hasText(extractedData?.role)) missing.push("role");
  return missing;
}

function logExtractionAttempt({
  messageId,
  rawMessage,
  parsedResult,
  missingFields,
  rejectionReason,
  accepted,
}) {
  const preview =
    rawMessage && rawMessage.length > 500
      ? `${rawMessage.slice(0, 500)}…`
      : rawMessage || "";

  console.log("[Extraction] rawMessage", preview);
  console.log("[Extraction] parsedResult", JSON.stringify(parsedResult));
  console.log("[Extraction] missingFields", JSON.stringify(missingFields));
  console.log(
    "[Extraction] rejectionReason",
    rejectionReason || (accepted ? "none" : "unknown")
  );

  const entry = {
    at: new Date().toISOString(),
    messageId: messageId || null,
    company: parsedResult.company || "",
    role: parsedResult.role || "",
    location: parsedResult.location || "",
    applyUrl: parsedResult.applyUrl || "",
    email: parsedResult.email || "",
    skills: parsedResult.skills || [],
    experience: parsedResult.experience || "",
    missingFields,
    rejectionReason: rejectionReason || null,
    accepted: Boolean(accepted),
  };

  attempts.unshift(entry);
  if (attempts.length > MAX_ATTEMPTS) {
    attempts.length = MAX_ATTEMPTS;
  }

  return entry;
}

/**
 * Validate extracted job data. Requires company + role only.
 * @returns {{ accepted: boolean, missingFields: string[], rejectionReason: string|null, parsedResult: object }}
 */
function validateExtraction(extractedData, { messageId, rawMessage } = {}) {
  const parsedResult = normalizeParsed(extractedData);
  const missingFields = getMissingRequiredFields(parsedResult);
  const accepted = missingFields.length === 0;
  const rejectionReason = accepted ? null : "incomplete_extraction";

  logExtractionAttempt({
    messageId,
    rawMessage,
    parsedResult,
    missingFields,
    rejectionReason,
    accepted,
  });

  return { accepted, missingFields, rejectionReason, parsedResult };
}

function getRecentExtractionAttempts(limit = MAX_ATTEMPTS) {
  return attempts.slice(0, Math.min(limit, MAX_ATTEMPTS)).map((row) => ({
    messageId: row.messageId,
    company: row.company,
    role: row.role,
    location: row.location,
    applyUrl: row.applyUrl,
    email: row.email,
    skills: row.skills,
    experience: row.experience,
    missingFields: row.missingFields,
    rejectionReason: row.rejectionReason,
    accepted: row.accepted,
    at: row.at,
  }));
}

module.exports = {
  validateExtraction,
  getRecentExtractionAttempts,
  getMissingRequiredFields,
  logExtractionAttempt,
};
