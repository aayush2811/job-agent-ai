const axios = require("axios");

const TELEGRAM_API = (token) =>
  `https://api.telegram.org/bot${token}/sendMessage`;

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
 * Sends a formatted error alert to the admin Telegram chat (same bot token + chat as the app).
 * @param {string} title Short human-readable title
 * @param {unknown} error Error object, string, or JSON-serializable value
 */
async function sendErrorAlert(title, error) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[Telegram] sendErrorAlert skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
    );
    return;
  }

  const text = buildAlertText(String(title || "Error"), error);

  try {
    await axios.post(TELEGRAM_API(token), {
      chat_id: chatId,
      text,
    });
    console.log(`[Telegram] error alert sent: ${title}`);
  } catch (err) {
    console.error(
      "[Telegram] failed to send error alert:",
      err?.response?.data || err?.message || err
    );
  }
}

/**
 * One-shot startup message when HTTP server and core wiring are up.
 */
async function sendStartupNotification() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[Telegram] startup notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
    );
    return;
  }

  const text = "🚀 AI Job Agent Started Successfully";

  try {
    await axios.post(TELEGRAM_API(token), {
      chat_id: chatId,
      text,
    });
    console.log("[Telegram] startup notification sent");
  } catch (err) {
    console.error(
      "[Telegram] failed to send startup notification:",
      err?.response?.data || err?.message || err
    );
  }
}

module.exports = {
  sendErrorAlert,
  sendStartupNotification,
};
