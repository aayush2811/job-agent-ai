const { Server } = require("socket.io");
const { getSocketCorsOptions, getAllowedOrigins } = require("../config/cors");
const { whatsappSocket } = require("../modules/whatsapp/whatsapp.socket");
const { pipelineBus, PIPELINE_EVENTS } = require("../services/pipelineBus");
const logger = require("../utils/logger");

/** @type {import('socket.io').Server | null} */
let io = null;
let bridgeAttached = false;
let heartbeatTimer = null;

const HEARTBEAT_MS = parseInt(process.env.SOCKET_HEARTBEAT_MS || "5000", 10);
const SOCKET_DEBUG = process.env.SOCKET_DEBUG === "true";

/** Never log these — high frequency / transport noise */
const SILENT_EVENTS = new Set([
  "server-heartbeat",
  "server:hello",
  "ping",
  "pong",
]);

/** Dev-only: log these realtime business events */
const IMPORTANT_EVENTS = new Set([
  ...PIPELINE_EVENTS,
  "job-added",
  "job-updated",
  "job-deleted",
  "resume-uploaded",
  "resume-updated",
  "resume-deleted",
  "whatsapp-status",
  "qr-updated",
  "application-added",
  "application-updated",
  "telegram-approval-requested",
  "telegram-approval-updated",
]);

const socketState = {
  status: "stopped",
  connections: 0,
  startedAt: null,
  namespace: "/",
  transports: {},
  lastHeartbeatAt: null,
  lastError: null,
  clients: [],
};

function updateClientList() {
  if (!io) {
    socketState.clients = [];
    return;
  }
  socketState.clients = [];
  for (const [id, socket] of io.sockets.sockets) {
    socketState.clients.push({
      id,
      transport: socket.conn?.transport?.name ?? "unknown",
      rooms: [...socket.rooms],
    });
  }
}

function getSocketState() {
  updateClientList();
  return {
    ...socketState,
    connections: io?.engine?.clientsCount ?? socketState.connections,
    uptime: socketState.startedAt
      ? Math.floor((Date.now() - new Date(socketState.startedAt).getTime()) / 1000)
      : 0,
    allowedOrigins: getAllowedOrigins(),
  };
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!io) return;
    socketState.lastHeartbeatAt = new Date().toISOString();
    io.emit("server-heartbeat", {
      timestamp: Date.now(),
      status: "alive",
      connections: io.engine.clientsCount,
    });
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

let pipelineBridgeAttached = false;

function attachPipelineBridge() {
  if (pipelineBridgeAttached) return;
  pipelineBridgeAttached = true;
  PIPELINE_EVENTS.forEach((eventName) => {
    pipelineBus.on(eventName, (payload) => {
      if (!io) return;
      io.emit(eventName, payload);
    });
  });
  logger.info("Socket", `pipeline bridge attached (${PIPELINE_EVENTS.length} events)`);
}

function attachSocketBridge() {
  if (bridgeAttached) return;
  bridgeAttached = true;

  const forward = (event) => (payload) => {
    if (!io) return;
    io.emit(event, payload);
  };

  whatsappSocket.on("whatsapp-status", forward("whatsapp-status"));
  whatsappSocket.on("qr-updated", forward("qr-updated"));
  attachPipelineBridge();
  logger.info("Socket", "WhatsApp bridge attached");
}

function attachInboundLogging(socket) {
  if (!SOCKET_DEBUG) return;

  socket.onAny((event) => {
    if (SILENT_EVENTS.has(event)) return;
    if (IMPORTANT_EVENTS.has(event)) {
      logger.debug("Socket", `in ${event} id=${socket.id}`);
    }
  });
}

function bindConnectionHandlers() {
  io.on("connection", (socket) => {
    const transport = socket.conn?.transport?.name ?? "unknown";
    socketState.connections = io.engine.clientsCount;
    socketState.transports[transport] = (socketState.transports[transport] || 0) + 1;
    updateClientList();

    logger.info(
      "Socket",
      `client connected id=${socket.id} transport=${transport} total=${socketState.connections}`
    );

    attachInboundLogging(socket);

    socket.conn.on("upgrade", (transportObj) => {
      logger.debug("Socket", `upgraded id=${socket.id} to=${transportObj?.name}`);
    });

    socket.conn.on("upgradeError", (err) => {
      logger.warn(
        "Socket",
        `websocket upgrade failed id=${socket.id} — staying on polling`,
        err?.message || err
      );
    });

    socket.emit("server:hello", {
      ok: true,
      socketId: socket.id,
      uptime: process.uptime(),
      at: new Date().toISOString(),
    });

    socket.on("disconnect", (reason) => {
      socketState.connections = io.engine.clientsCount;
      logger.info(
        "Socket",
        `client disconnected id=${socket.id} reason=${reason} total=${socketState.connections}`
      );
      updateClientList();
    });

    socket.on("error", (err) => {
      socketState.lastError = err?.message || String(err);
      logger.error("Socket", `socket error id=${socket.id}`, socketState.lastError);
    });
  });

  io.engine.on("connection_error", (err) => {
    socketState.lastError = err?.message || String(err);
    logger.error("Socket", "connection_error", socketState.lastError);
  });
}

function initSocketIO(httpServer) {
  if (io) {
    logger.debug("Socket", "already initialized — reusing singleton");
    return io;
  }

  io = new Server(httpServer, {
    cors: getSocketCorsOptions(),
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
    },
    transports: ["polling", "websocket"],
  });

  bindConnectionHandlers();
  attachSocketBridge();

  socketState.status = "running";
  socketState.startedAt = new Date().toISOString();
  socketState.namespace = "/";

  startHeartbeat();

  logger.info("Socket", `server ready heartbeat=${HEARTBEAT_MS}ms (silent in logs)`);

  return io;
}

async function closeSocketIO() {
  stopHeartbeat();
  if (!io) return;
  return new Promise((resolve) => {
    io.close(() => {
      socketState.status = "stopped";
      socketState.connections = 0;
      socketState.clients = [];
      io = null;
      bridgeAttached = false;
      logger.info("Socket", "server closed");
      resolve();
    });
  });
}

function getIO() {
  return io;
}

module.exports = {
  initSocketIO,
  closeSocketIO,
  getIO,
  getSocketState,
};
