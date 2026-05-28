const logger = require("../utils/logger");

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

function parseOriginList(raw) {
  return String(raw || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/** Env-based explicit origins (comma-separated). */
function getConfiguredOrigins() {
  const chunks = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    process.env.SOCKET_CORS_ORIGIN,
  ].filter(Boolean);
  const merged = chunks.flatMap((c) => parseOriginList(c));
  return [...new Set(merged)];
}

/** Full allow-list: defaults + FRONTEND_URL/CORS_ORIGIN (+ SOCKET_CORS_ORIGIN duplicates removed). */
function getAllowedOrigins() {
  return [...new Set([...DEFAULT_ORIGINS, ...getConfiguredOrigins()])];
}

/**
 * Origin check aligned with unified CORS policy.
 * Non-production keeps legacy permissive behavior (any browser origin).
 */
function isOriginAllowed(origin) {
  const explicit = getConfiguredOrigins();
  const allowAll =
    explicit.includes("*") ||
    explicit.some((o) => String(o).trim() === "*");

  if (!isProduction()) {
    if (!origin || allowAll) return true;
    const allowed = new Set([...DEFAULT_ORIGINS, ...explicit.filter((o) => o !== "*")]);
    if (allowed.has(origin)) return true;
    const allowVercelDev =
      process.env.CORS_ALLOW_VERCEL === "true" ||
      process.env.SOCKET_ALLOW_VERCEL === "true" ||
      process.env.SOCKET_ALLOW_VERCEL === undefined;
    if (allowVercelDev && /\.vercel\.app$/i.test(origin)) return true;
    /* Legacy Express CORS behavior: OK for local/staging IPs not listed in DEFAULT_ORIGINS */
    return true;
  }

  if (!origin) return true;

  if (allowAll) {
    logger.warn(
      "CORS",
      'CORS_ORIGIN includes "*" in production — use explicit frontend URLs'
    );
    return true;
  }

  const productionOrigins = explicit.filter((o) => o !== "*");
  if (productionOrigins.length === 0) {
    logger.warn(
      "CORS",
      "No CORS_ORIGIN/FRONTEND_URL in production — only default localhost + same-origin helpers apply"
    );
  }

  if (productionOrigins.includes(origin)) return true;

  const allowVercel =
    process.env.CORS_ALLOW_VERCEL === "true" ||
    process.env.SOCKET_ALLOW_VERCEL === "true";

  if (allowVercel && /\.vercel\.app$/i.test(origin)) return true;

  return false;
}

/**
 * Express cors() options for HTTP API.
 */
function getCorsOptions() {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin || undefined)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin || "unknown"}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  };
}

/**
 * Socket.IO Server `cors` option — callback form matches HTTP policy + Vercel patterns.
 */
function getSocketCorsOptions() {
  return {
    origin(origin, callback) {
      try {
        const ok = isOriginAllowed(origin || undefined);
        return callback(null, ok);
      } catch (err) {
        return callback(err, false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  };
}

module.exports = {
  getCorsOptions,
  getSocketCorsOptions,
  getAllowedOrigins,
  getConfiguredOrigins,
  DEFAULT_ORIGINS,
  isProduction,
};
