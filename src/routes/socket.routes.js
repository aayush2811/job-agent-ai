const express = require("express");
const { getSocketState } = require("../sockets");

const router = express.Router();

router.get("/status", (req, res) => {
  const state = getSocketState();
  res.json({
    success: true,
    data: {
      status: state.status,
      connections: state.connections,
      uptime: state.uptime,
      startedAt: state.startedAt,
      namespace: state.namespace,
      transports: state.transports,
      clients: state.clients,
      lastHeartbeatAt: state.lastHeartbeatAt,
      lastError: state.lastError,
      allowedOrigins: state.allowedOrigins,
    },
  });
});

module.exports = router;
