const express = require("express");
const cors = require("cors");
const { getCorsOptions } = require("./config/cors");
const requestLogger = require("./middleware/requestLogger");
const requestTimeout = require("./middleware/requestTimeout");
const jobRoutes = require("./jobs/job.routes");
const healthRoutes = require("./routes/health.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const applicationsRoutes = require("./routes/applications.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const activityRoutes = require("./routes/activity.routes");
const socketRoutes = require("./routes/socket.routes");

const app = express();

app.use(cors(getCorsOptions()));
app.options(/.*/, cors(getCorsOptions()));
app.use(requestLogger);
app.use(requestTimeout());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "Job Agent AI API", data: { version: "1.0.0" } });
});

app.get("/health", (req, res) => {
  res.redirect(307, "/api/health");
});

app.use("/api/health", healthRoutes);

app.use("/api/jobs", jobRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/socket", socketRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found", data: null });
});

app.use((err, req, res, next) => {
  console.error("[API] error:", err?.message || err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error",
    data: null,
  });
});

module.exports = app;
