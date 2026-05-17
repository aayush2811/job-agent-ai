const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

function getAllowedOrigins() {
  const fromEnv = [process.env.FRONTEND_URL, process.env.CORS_ORIGIN].filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
}

function getCorsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  };
}

function getSocketCorsOptions() {
  const allowedOrigins = getAllowedOrigins();
  return {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  };
}

module.exports = {
  getCorsOptions,
  getSocketCorsOptions,
  getAllowedOrigins,
  DEFAULT_ORIGINS,
};
