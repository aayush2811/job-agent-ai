const mongoose = require("mongoose");
const User = require("./user.model");

let cachedPipelineUserId = null;

/**
 * WhatsApp pipeline is still single-session; jobs attach to configured owner.
 */
async function resolvePipelineUserId() {
  if (cachedPipelineUserId) return cachedPipelineUserId;

  const fromEnv = process.env.DEFAULT_PIPELINE_USER_ID;
  if (fromEnv && mongoose.Types.ObjectId.isValid(fromEnv)) {
    cachedPipelineUserId = fromEnv;
    return cachedPipelineUserId;
  }

  const admin = await User.findOne({ role: "admin" }).select("_id").lean();
  if (admin?._id) {
    cachedPipelineUserId = String(admin._id);
    return cachedPipelineUserId;
  }

  const first = await User.findOne().sort({ createdAt: 1 }).select("_id").lean();
  if (first?._id) {
    cachedPipelineUserId = String(first._id);
    return cachedPipelineUserId;
  }

  return null;
}

function clearPipelineUserCache() {
  cachedPipelineUserId = null;
}

module.exports = { resolvePipelineUserId, clearPipelineUserCache };
