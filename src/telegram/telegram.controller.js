const { sendTestMessage, getTelegramState } = require("./bot");
const { isTelegramEnabled, hasTelegramCredentials } = require("./config");

async function getStatus(req, res) {
  res.json({
    success: true,
    data: {
      enabled: isTelegramEnabled(),
      credentials: hasTelegramCredentials(),
      state: getTelegramState(),
    },
  });
}

async function postTest(req, res) {
  try {
    const result = await sendTestMessage(req.user.id);
    if (!result.ok) {
      return res.status(result.statusCode || 503).json({
        success: false,
        message: result.error || "Telegram test failed",
        telegramResponse: result.telegramResponse || null,
        data: result,
      });
    }
    res.json({
      success: true,
      message: "Test notification sent",
      telegramResponse: result.telegramResponse,
      data: result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "Telegram test failed",
      telegramResponse: null,
      data: null,
    });
  }
}

async function getDebug(req, res) {
  const st = getTelegramState();
  res.json({
    success: true,
    data: {
      enabled: isTelegramEnabled(),
      hasCredentials: hasTelegramCredentials(),
      credentialsLoaded: hasTelegramCredentials(),
      isPolling: st.isPolling,
      botUsername: st.botUsername,
      chatConnected: st.chatConnected,
      lastError: st.lastError,
      status: st.status,
      hasBot: st.hasBot,
    },
  });
}

module.exports = { getStatus, postTest, getDebug };
