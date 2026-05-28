const cors = require("cors");
const helmet = require("helmet");
const { getCorsOptions } = require("../config/cors");
const pathFirewall = require("./pathFirewall");
const {
  apiRateLimiter,
  authRateLimiter,
  socketHttpRateLimiter,
} = require("./rateLimits");

/**
 * @param {import('express').Express} app
 */
function configureTrustProxy(app) {
  if (process.env.TRUST_PROXY === "true") {
    const hops = parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
    app.set("trust proxy", Number.isFinite(hops) ? hops : 1);
  }
}

/**
 * @param {import('express').Express} app
 */
function applySecurityMiddleware(app) {
  configureTrustProxy(app);
  app.disable("x-powered-by");

  app.use(pathFirewall);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  app.use(cors(getCorsOptions()));

  app.use("/socket.io", socketHttpRateLimiter);
  app.use("/api/auth", authRateLimiter);
  app.use("/api", apiRateLimiter);
}

module.exports = {
  applySecurityMiddleware,
  configureTrustProxy,
};
