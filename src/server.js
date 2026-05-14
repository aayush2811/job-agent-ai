require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const connectDB = require("./database/db");
const startWhatsApp = require("./whatsapp/client");
const { sendErrorAlert, sendStartupNotification } = require("./utils/errorNotifier");
const jobService = require("./jobs/job.service");
const jobRoutes = require("./jobs/job.routes");

const app = express();

app.use(express.json());

function mongoStatusLabel() {
  const state = mongoose.connection.readyState;
  if (state === 1) return "connected";
  if (state === 2) return "connecting";
  if (state === 3) return "disconnecting";
  return "disconnected";
}

app.get("/health", (req, res) => {
  const mongo = mongoStatusLabel();
  const whatsapp = startWhatsApp.getWhatsappStatus();

  const ok = mongo === "connected" && whatsapp === "connected";
  const status = ok ? "ok" : "degraded";

  const body = {
    status,
    server: "running",
    mongo,
    whatsapp,
    uptime: process.uptime(),
  };

  console.log(
    `[Health] ${status} mongo=${mongo} whatsapp=${whatsapp} uptime=${Math.floor(
      process.uptime()
    )}s`
  );

  res.status(ok ? 200 : 503).json(body);
});

app.get("/", (req, res) => {
  res.send("🚀 Job Agent AI Running");
});

app.use("/api/jobs", jobRoutes);

async function bootstrap() {
  await connectDB();

  await jobService.migrateLegacyJobStatuses();

  startWhatsApp();

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, async () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(
      `[PM2/Process] boot ok pid=${process.pid} NODE_ENV=${process.env.NODE_ENV || "undefined"}`
    );
    await sendStartupNotification();
  });
}

process.on("unhandledRejection", async (reason) => {
  console.error("[Process] unhandledRejection:", reason);
  try {
    await sendErrorAlert("Unhandled Promise Rejection", reason);
  } catch (e) {
    console.error("[Process] sendErrorAlert failed (unhandledRejection):", e);
  }
});

process.on("uncaughtException", async (error) => {
  console.error("[Process] uncaughtException:", error);
  try {
    await sendErrorAlert("Uncaught Exception", error);
  } catch (e) {
    console.error("[Process] sendErrorAlert failed (uncaughtException):", e);
  }
  process.exit(1);
});

bootstrap().catch(async (err) => {
  console.error("[Process] bootstrap failed:", err);
  try {
    await sendErrorAlert("Server Bootstrap Failed", err);
  } catch (e) {
    console.error("[Process] sendErrorAlert failed (bootstrap):", e);
  }
  process.exit(1);
});
