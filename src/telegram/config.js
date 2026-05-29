/**
 * Telegram feature flag and credentials. Subsystem is opt-in via TELEGRAM_ENABLED.
 */

function normalizeEnvString(value) {
  if (value === undefined || value === null) return "";
  let s = String(value).trim();
  // Strip UTF-8 BOM and stray carriage returns (common on Windows .env)
  s = s.replace(/^\uFEFF/, "").replace(/\r$/, "");
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function parseEnvBool(value, defaultValue = false) {
  const normalized = normalizeEnvString(value).toLowerCase();
  if (normalized === "") return defaultValue;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function getTelegramEnabledRaw() {
  const raw = process.env.TELEGRAM_ENABLED ?? process.env.TELEGRAM_ENABLE;
  return raw === undefined || raw === null ? "" : raw;
}

function hasTelegramCredentials() {
  return Boolean(
    normalizeEnvString(process.env.TELEGRAM_BOT_TOKEN) &&
      normalizeEnvString(process.env.TELEGRAM_CHAT_ID)
  );
}

/**
 * Enabled when TELEGRAM_ENABLED is truthy, OR when credentials exist and the flag
 * was never set (common PM2 partial-env case). Set TELEGRAM_AUTO_ENABLE=false to
 * disable that fallback.
 */
function isTelegramEnabled() {
  const raw = getTelegramEnabledRaw();
  if (normalizeEnvString(raw) !== "") {
    return parseEnvBool(raw, false);
  }
  if (hasTelegramCredentials()) {
    return parseEnvBool(process.env.TELEGRAM_AUTO_ENABLE, true);
  }
  return false;
}

function isTelegramOperational() {
  return isTelegramEnabled() && hasTelegramCredentials();
}

function getTelegramEnvDiagnostics() {
  const raw = getTelegramEnabledRaw();
  const enabled = isTelegramEnabled();
  const creds = hasTelegramCredentials();
  return {
    envTELEGRAM_ENABLED: raw === "" ? "(unset)" : String(raw),
    hasCredentials: creds,
    isTelegramEnabled: enabled,
    isTelegramOperational: enabled && creds,
    nodeEnv: process.env.NODE_ENV || "development",
    cwd: process.cwd(),
    autoEnableFallback:
      normalizeEnvString(raw) === "" && creds
        ? parseEnvBool(process.env.TELEGRAM_AUTO_ENABLE, true)
        : false,
  };
}

function logTelegramStartupDiagnostics() {
  const d = getTelegramEnvDiagnostics();
  console.log(`[Telegram] env TELEGRAM_ENABLED=${d.envTELEGRAM_ENABLED}`);
  console.log(`[Telegram] hasCredentials=${d.hasCredentials}`);
  console.log(`[Telegram] isTelegramEnabled=${d.isTelegramEnabled}`);
  console.log(`[Telegram] isTelegramOperational=${d.isTelegramOperational}`);
  if (d.autoEnableFallback) {
    console.log(
      "[Telegram] TELEGRAM_ENABLED unset — auto-enabled because credentials are present (set TELEGRAM_AUTO_ENABLE=false to disable)"
    );
  }
}

module.exports = {
  parseEnvBool,
  normalizeEnvString,
  isTelegramEnabled,
  hasTelegramCredentials,
  isTelegramOperational,
  getTelegramEnvDiagnostics,
  logTelegramStartupDiagnostics,
};
