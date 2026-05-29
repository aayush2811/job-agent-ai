/**
 * PM2 ecosystem for production on Ubuntu / EC2 (Node + Chromium + whatsapp-web.js).
 * Start: pm2 start ecosystem.config.js --env production
 *
 * Loads .env from project root so TELEGRAM_ENABLED and credentials reach the process
 * (PM2 does not load .env on its own).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

function pickEnv(keys) {
  const out = {};
  for (const key of keys) {
    if (process.env[key] !== undefined && process.env[key] !== "") {
      out[key] = process.env[key];
    }
  }
  return out;
}

const sharedEnv = pickEnv([
  "PORT",
  "MONGO_URI",
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "CORS_ORIGINS",
  "TRUST_PROXY",
  "TELEGRAM_ENABLED",
  "TELEGRAM_AUTO_ENABLE",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_CHAT_MAP",
]);

module.exports = {
  apps: [
    {
      name: "job-agent-ai",
      script: "./src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "10s",
      restart_delay: 5000,
      max_memory_restart: "500M",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "development",
        ...sharedEnv,
      },
      env_production: {
        NODE_ENV: "production",
        ...sharedEnv,
      },
    },
  ],
};
