/**
 * PM2 ecosystem for production on Ubuntu / EC2 (Node + Chromium + whatsapp-web.js).
 * Start: pm2 start ecosystem.config.js --env production
 */
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
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
