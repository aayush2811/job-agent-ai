const Job = require("../jobs/job.model");
const { resolvePipelineUserId } = require("../users/pipelineOwner");

/**
 * Resolve Telegram chat id for a user.
 * Default: TELEGRAM_CHAT_ID. Optional per-user map: TELEGRAM_CHAT_MAP={"userId":"chatId"}
 */
function resolveChatIdForUser(userId) {
  const defaultId = process.env.TELEGRAM_CHAT_ID;
  if (!userId) return defaultId || null;

  const raw = process.env.TELEGRAM_CHAT_MAP;
  if (raw) {
    try {
      const map = JSON.parse(raw);
      const key = String(userId);
      if (map[key]) return String(map[key]);
    } catch {
      console.warn("[Telegram] TELEGRAM_CHAT_MAP is not valid JSON — using TELEGRAM_CHAT_ID");
    }
  }

  return defaultId || null;
}

async function resolveOwnerUserIdForJob(jobOrId) {
  if (jobOrId?.userId) return String(jobOrId.userId);

  const id = jobOrId?._id || jobOrId;
  if (id) {
    const doc = await Job.findById(id).select("userId").lean();
    if (doc?.userId) return String(doc.userId);
  }

  const pipelineUser = await resolvePipelineUserId();
  return pipelineUser || null;
}

async function resolveChatForJob(job) {
  const userId = await resolveOwnerUserIdForJob(job);
  const chatId = resolveChatIdForUser(userId);
  return { chatId, userId };
}

module.exports = {
  resolveChatIdForUser,
  resolveOwnerUserIdForJob,
  resolveChatForJob,
};
