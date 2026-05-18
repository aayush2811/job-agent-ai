const axios = require("axios");
const {
  isTelegramEnabled,
  isTelegramOperational,
} = require("../telegram/config");

const TELEGRAM_API = (token) =>
  `https://api.telegram.org/bot${token}/sendMessage`;

const AlertLevel = {
  CRITICAL: "critical",
  WARNING: "warning",
  DEBUG: "debug",
};

/** Initial try + up to 3 retries */
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2000;
const TELEGRAM_TIMEOUT_MS = 15000;

/** Identical alerts are suppressed within these windows (ms). */
const THROTTLE_MS = {
  [AlertLevel.CRITICAL]: 60_000,
  [AlertLevel.WARNING]: 5 * 60_000,
  [AlertLevel.DEBUG]: Infinity,
};

const lastAlertSentAt = new Map();
const MAX_THROTTLE_ENTRIES = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorBody(error) {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error.slice(0, 3500);
  if (error instanceof Error) {
    const stack = error.stack || error.message;
    return String(stack).slice(0, 3500);
  }
  try {
    return JSON.stringify(error, null, 2).slice(0, 3500);
  } catch {
    return String(error).slice(0, 3500);
  }
}

function buildAlertText(level, title, error) {
  const prefix =
    level === AlertLevel.CRITICAL
      ? "🚨 CRITICAL"
      : level === AlertLevel.WARNING
        ? "⚠️ WARNING"
        : "🔍 DEBUG";
  const body = formatErrorBody(error);
  return `${prefix}\n\nTitle: ${title}\n\nError:\n${body}`;
}

function throttleKey(level, title, error) {
  const body =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : formatErrorBody(error);
  return `${level}::${title}::${body}`.slice(0, 300);
}

function pruneThrottleMap() {
  if (lastAlertSentAt.size <= MAX_THROTTLE_ENTRIES) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of lastAlertSentAt) {
    if (ts < cutoff) lastAlertSentAt.delete(key);
  }
}

function isThrottled(level, title, error) {
  if (level === AlertLevel.DEBUG) return true;

  const key = throttleKey(level, title, error);
  const window = THROTTLE_MS[level] ?? THROTTLE_MS[AlertLevel.WARNING];
  const now = Date.now();
  const last = lastAlertSentAt.get(key);
  if (last != null && now - last < window) return true;

  lastAlertSentAt.set(key, now);
  pruneThrottleMap();
  return false;
}

/** Avoid Telegram → Telegram feedback loops (polling failures, send retries, etc.). */
function isTelegramInternalAlert(title, error) {
  const combined = `${title} ${formatErrorBody(error)}`.toLowerCase();
  if (!combined.includes("telegram")) return false;
  return (
    combined.includes("polling") ||
    combined.includes("send failed") ||
    combined.includes("alert sent") ||
    combined.includes("efatal") ||
    combined.includes("aggregateerror")
  );
}

function logLocal(level, title, error, extra) {
  const msg = `[Telegram:${level}] ${title}${extra ? ` — ${extra}` : ""}`;
  if (level === AlertLevel.DEBUG) {
    console.debug(msg, error?.message || error || "");
    return;
  }
  if (level === AlertLevel.WARNING) {
    console.warn(msg, error?.message || error || "");
    return;
  }
  console.error(msg, error?.message || error || "");
}

/**
 * Sends a plain-text Telegram message with timeout, retries, and safe logging.
 * Never throws; failures are logged only so the process keeps running (PM2 / EC2).
 * @param {string} message Telegram message text (truncated to API limit)
 * @returns {Promise<boolean>} true if Telegram accepted the message, false otherwise
 */
async function sendTelegramMessage(message) {
  try {
    if (!isTelegramOperational()) {
      return false;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const text = String(message ?? "").slice(0, 4096);
    if (!text) {
      console.warn("[Telegram] sendTelegramMessage skipped: empty message");
      return false;
    }

    const url = TELEGRAM_API(token);
    const payload = { chat_id: chatId, text };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await axios.post(url, payload, {
          timeout: TELEGRAM_TIMEOUT_MS,
          headers: { "Content-Type": "application/json" },
        });
        return true;
      } catch (err) {
        const detail =
          err?.response?.data ?? err?.code ?? err?.message ?? String(err);
        console.error(`[Telegram] send failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, detail);

        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    console.error("[Telegram] send failed after all retries; continuing without Telegram.");
    return false;
  } catch (unexpected) {
    console.error(
      "[Telegram] sendTelegramMessage unexpected error:",
      unexpected?.message || unexpected
    );
    return false;
  }
}

/**
 * @param {'critical'|'warning'|'debug'} level
 * @param {string} title
 * @param {unknown} error
 */
async function sendAlert(level, title, error) {
  try {
    const safeTitle = String(title || "Error");

    if (!isTelegramEnabled()) {
      if (level !== AlertLevel.DEBUG) {
        logLocal(level, safeTitle, error, "telegram disabled");
      }
      return;
    }

    if (level === AlertLevel.DEBUG) {
      logLocal(AlertLevel.DEBUG, safeTitle, error);
      return;
    }

    if (isTelegramInternalAlert(safeTitle, error)) {
      logLocal(level, safeTitle, error, "suppressed (telegram-internal)");
      return;
    }

    if (isThrottled(level, safeTitle, error)) {
      logLocal(level, safeTitle, error, "suppressed (throttled)");
      return;
    }

    if (!isTelegramOperational()) {
      logLocal(level, safeTitle, error, "skipped (missing credentials)");
      return;
    }

    const text = buildAlertText(level, safeTitle, error);
    await sendTelegramMessage(text);
  } catch (e) {
    console.error(
      "[Telegram] sendAlert wrapper error (non-fatal):",
      e?.message || e
    );
  }
}

async function sendCriticalAlert(title, error) {
  return sendAlert(AlertLevel.CRITICAL, title, error);
}

async function sendWarningAlert(title, error) {
  return sendAlert(AlertLevel.WARNING, title, error);
}

async function sendDebugAlert(title, error) {
  return sendAlert(AlertLevel.DEBUG, title, error);
}

/**
 * Sends a formatted error alert (critical severity).
 * @param {string} title Short human-readable title
 * @param {unknown} error Error object, string, or JSON-serializable value
 */
async function sendErrorAlert(title, error) {
  return sendCriticalAlert(title, error);
}

/**
 * One-shot startup message when HTTP server and core wiring are up.
 */
async function sendStartupNotification() {
  try {
    if (!isTelegramOperational()) return;
    await sendTelegramMessage("🚀 AI Job Agent Started Successfully");
  } catch (e) {
    console.error(
      "[Telegram] sendStartupNotification wrapper error (non-fatal):",
      e?.message || e
    );
  }
}

module.exports = {
  AlertLevel,
  sendTelegramMessage,
  sendAlert,
  sendCriticalAlert,
  sendWarningAlert,
  sendDebugAlert,
  sendErrorAlert,
  sendStartupNotification,
};
