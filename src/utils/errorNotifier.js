const axios = require("axios");

const TELEGRAM_API = (token) =>
  `https://api.telegram.org/bot${token}/sendMessage`;

/** Initial try + up to 3 retries */
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2000;
const TELEGRAM_TIMEOUT_MS = 15000;

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

function buildAlertText(title, error) {
  const body = formatErrorBody(error);
  return (
    `🚨 SERVER ERROR\n\n` +
    `Title: ${title}\n\n` +
    `Error:\n` +
    `${body}`
  );
}

/**
 * Sends a plain-text Telegram message with timeout, retries, and safe logging.
 * Never throws; failures are logged only so the process keeps running (PM2 / EC2).
 * @param {string} message Telegram message text (truncated to API limit)
 * @returns {Promise<boolean>} true if Telegram accepted the message, false otherwise
 */
async function sendTelegramMessage(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn(
        "[Telegram] sendTelegramMessage skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
      );
      return false;
    }

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
        console.log("📨 Telegram Alert Sent");
        return true;
      } catch (err) {
        const detail =
          err?.response?.data ?? err?.code ?? err?.message ?? String(err);
        console.error(`❌ Telegram Send Failed (Attempt ${attempt})`);
        console.error("[Telegram] detail:", detail);

        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    console.error(
      "[Telegram] send failed after all retries; continuing without Telegram."
    );
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
 * Sends a formatted error alert to the admin Telegram chat (same bot token + chat as the app).
 * @param {string} title Short human-readable title
 * @param {unknown} error Error object, string, or JSON-serializable value
 */
async function sendErrorAlert(title, error) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn(
        "[Telegram] sendErrorAlert skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
      );
      return;
    }

    const text = buildAlertText(String(title || "Error"), error);
    await sendTelegramMessage(text);
  } catch (e) {
    console.error(
      "[Telegram] sendErrorAlert wrapper error (non-fatal):",
      e?.message || e
    );
  }
}

/**
 * One-shot startup message when HTTP server and core wiring are up.
 */
async function sendStartupNotification() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn(
        "[Telegram] startup notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
      );
      return;
    }

    await sendTelegramMessage("🚀 AI Job Agent Started Successfully");
  } catch (e) {
    console.error(
      "[Telegram] sendStartupNotification wrapper error (non-fatal):",
      e?.message || e
    );
  }
}

module.exports = {
  sendTelegramMessage,
  sendErrorAlert,
  sendStartupNotification,
};
