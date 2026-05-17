const express = require("express");
const mongoose = require("mongoose");
const { startedAt } = require("../utils/startupLogger");
const { isMongoConnected } = require("../database/db");
const { getSocketState } = require("../sockets");

const router = express.Router();

function mongoStatusLabel() {
  try {
    const state = mongoose.connection.readyState;
    if (state === 1) return "connected";
    if (state === 2) return "connecting";
    if (state === 3) return "disconnecting";
    return "disconnected";
  } catch {
    return "unknown";
  }
}

function safeTelegramState() {
  try {
    const { getTelegramState } = require("../telegram/bot");
    return getTelegramState();
  } catch (e) {
    return { status: "unknown", error: e?.message };
  }
}

function safeWhatsappState() {
  try {
    const whatsappService = require("../modules/whatsapp/whatsapp.service");
    return whatsappService.getPublicState();
  } catch (e) {
    return { status: "unavailable", lastError: e?.message };
  }
}

function safeSocketState() {
  try {
    return getSocketState();
  } catch (e) {
    return {
      status: "unknown",
      connections: 0,
      error: e?.message,
    };
  }
}

function buildHealthPayload() {
  const mongo = mongoStatusLabel();
  const whatsappState = safeWhatsappState();
  const socket = safeSocketState();
  const telegram = safeTelegramState();

  const mongoOk = isMongoConnected();
  const serverUp = true;
  const socketOk = socket.status === "running";

  const status =
    serverUp && mongoOk && socketOk
      ? whatsappState.status === "connected"
        ? "ok"
        : "degraded"
      : "degraded";

  return {
    status,
    server: {
      running: serverUp,
      uptime: process.uptime(),
      startedAt,
      pid: process.pid,
      nodeEnv: process.env.NODE_ENV || "development",
    },
    mongo: {
      status: mongo,
      connected: mongoOk,
    },
    socket: {
      status: socket.status,
      connections: socket.connections,
      startedAt: socket.startedAt,
    },
    whatsapp: whatsappState,
    telegram,
    timestamp: new Date().toISOString(),
  };
}

router.get("/", (req, res) => {
  try {
    const body = buildHealthPayload();
    res.status(200).json({ success: true, data: body });
  } catch (e) {
    res.status(200).json({
      success: true,
      data: {
        status: "degraded",
        server: { running: true, uptime: process.uptime() },
        error: e?.message || String(e),
        timestamp: new Date().toISOString(),
      },
    });
  }
});

module.exports = router;
