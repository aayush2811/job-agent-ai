const { Server } = require("socket.io");
const { getSocketCorsOptions, getAllowedOrigins } = require("../config/cors");
const { whatsappSocket } = require("../modules/whatsapp/whatsapp.socket");
const { pipelineBus, PIPELINE_EVENTS } = require("../services/pipelineBus");

/** @type {import('socket.io').Server | null} */
let io = null;
let bridgeAttached = false;
let heartbeatTimer = null;

const HEARTBEAT_MS = parseInt(process.env.SOCKET_HEARTBEAT_MS || "5000", 10);

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

function previewPayload(payload) {
  try {
    const s = JSON.stringify(payload);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(payload);
  }
}

function logEmit(scope, event, payload, meta = {}) {
  console.log(
    `[Socket Emit] ${event} scope=${scope} ${JSON.stringify({
      ...meta,
      preview: previewPayload(payload),
    })}`
  );
}

function logReceive(socketId, event, payload) {
  console.log(
    `[Socket Receive] ${event} socketId=${socketId} preview=${previewPayload(payload)}`
  );
}

function patchEmitter(emitter, scope) {
  const originalEmit = emitter.emit.bind(emitter);
  emitter.emit = function patchedEmit(event, ...args) {
    logEmit(scope, event, args[0], {
      heartbeat: event === "server-heartbeat",
    });
    return originalEmit(event, ...args);
  };
}

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
    const payload = {
      timestamp: Date.now(),
      status: "alive",
      connections: io.engine.clientsCount,
    };
    socketState.lastHeartbeatAt = new Date().toISOString();
    io.emit("server-heartbeat", payload);
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
  console.log("[Socket] Pipeline bridge attached:", PIPELINE_EVENTS.join(", "));
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
  console.log("[Socket] WhatsApp bridge attached (whatsapp-status, qr-updated)");
}

function bindConnectionHandlers() {
  io.on("connection", (socket) => {
    const transport = socket.conn?.transport?.name ?? "unknown";
    socketState.connections = io.engine.clientsCount;

    console.log(
      `[Socket] Client connected: ${socket.id} transport=${transport} namespace=${socket.nsp.name} total=${socketState.connections}`
    );
    console.log(`[Socket] Transport: ${transport}`);
    console.log(`[Socket] Rooms: ${[...socket.rooms].join(", ") || "(default)"}`);

    socketState.transports[transport] = (socketState.transports[transport] || 0) + 1;
    updateClientList();

    patchEmitter(socket, `socket:${socket.id}`);

    socket.onAny((event, ...args) => {
      logReceive(socket.id, event, args[0]);
    });

    socket.conn.on("upgrade", (transportObj) => {
      console.log(
        `[Socket] Transport upgraded socketId=${socket.id} to=${transportObj?.name}`
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
      console.log(
        `[Socket] Client disconnected: ${socket.id} reason=${reason} total=${socketState.connections}`
      );
      updateClientList();
    });

    socket.on("error", (err) => {
      socketState.lastError = err?.message || String(err);
      console.error(`[Socket] Socket error id=${socket.id}:`, socketState.lastError);
    });
  });

  io.engine.on("connection_error", (err) => {
    socketState.lastError = err?.message || String(err);
    console.error("[Socket] connection_error:", socketState.lastError, err?.context);
  });

  io.engine.on("initial_headers", (headers, req) => {
    console.log(
      `[Socket] handshake from ${req.headers.origin || req.headers.referer || "unknown"}`
    );
  });
}

function initSocketIO(httpServer) {
  if (io) {
    console.log("[Socket] already initialized — reusing singleton io");
    return io;
  }

  const cors = getSocketCorsOptions();
  console.log("[Socket] cors config loaded:", JSON.stringify(cors.origin));
  console.log("[Socket] attaching io to http.Server");

  io = new Server(httpServer, {
    cors,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
    },
    transports: ["websocket", "polling"],
  });

  patchEmitter(io, "io");
  bindConnectionHandlers();
  attachSocketBridge();

  socketState.status = "running";
  socketState.startedAt = new Date().toISOString();
  socketState.namespace = "/";

  startHeartbeat();

  console.log("[Socket] server initialized");
  console.log(`[Socket] heartbeat every ${HEARTBEAT_MS}ms (server-heartbeat)`);

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
      console.log("[Socket] server closed");
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
