const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

/**
 * Never throw — WhatsApp/Puppeteer state must not break the API.
 */
function safeWhatsappPayload() {
  try {
    const whatsappService = require("../modules/whatsapp/whatsapp.service");
    return whatsappService.getPublicState();
  } catch (e) {
    console.error("[API] whatsapp status fallback:", e?.message);
    return {
      status: "unavailable",
      isInitializing: false,
      isReady: false,
      isAuthenticated: false,
      reconnectAttempts: 0,
      hadConnectedOnce: false,
      hasQr: false,
      lastError: e?.message || "whatsapp_module_error",
      lastEventAt: null,
    };
  }
}

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: safeWhatsappPayload(),
    });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      message: "WhatsApp API",
      data: safeWhatsappPayload(),
    });
  })
);

module.exports = router;
