/**
 * Telegram feature flag and credentials. Subsystem is opt-in via TELEGRAM_ENABLED.
 */

function parseEnvBool(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isTelegramEnabled() {
  return parseEnvBool(process.env.TELEGRAM_ENABLED, false);
}

function hasTelegramCredentials() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function isTelegramOperational() {
  return isTelegramEnabled() && hasTelegramCredentials();
}

module.exports = {
  parseEnvBool,
  isTelegramEnabled,
  hasTelegramCredentials,
  isTelegramOperational,
};
