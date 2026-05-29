const express = require("express");

const { applySecurityMiddleware } = require("./security/applySecurity");

const { requireAuth } = require("./auth/auth.middleware");

const requestLogger = require("./middleware/requestLogger");

const requestTimeout = require("./middleware/requestTimeout");

const jobRoutes = require("./jobs/job.routes");

const healthRoutes = require("./routes/health.routes");

const dashboardRoutes = require("./routes/dashboard.routes");

const applicationsRoutes = require("./routes/applications.routes");

const whatsappRoutes = require("./routes/whatsapp.routes");

const activityRoutes = require("./routes/activity.routes");

const socketRoutes = require("./routes/socket.routes");

const analyticsRoutes = require("./analytics/analytics.routes");

const resumeRoutes = require("./resumes/resume.routes");

const matchingRoutes = require("./matching/matching.routes");

const authRoutes = require("./auth/auth.routes");
const { logMountedAuthRoutes } = require("./auth/logAuthRoutes");

const usersRoutes = require("./users/users.routes");

const telegramRoutes = require("./telegram/telegram.routes");

const { ensureUploadDir } = require("./resumes/multer.config");

const { uploadsAccessGuard } = require("./security/uploadGuard");



ensureUploadDir();



const app = express();



applySecurityMiddleware(app);



app.use(requestLogger);

app.use(requestTimeout());

app.use(express.json({ limit: "1mb" }));



app.use(uploadsAccessGuard);



app.get("/", (req, res) => {

  res.json({ success: true, message: "Job Agent AI API", data: { version: "1.0.0" } });

});



app.get("/health", (req, res) => {

  res.redirect(307, "/api/health");

});



app.use("/api/health", healthRoutes);

app.use("/api/auth", authRoutes);
logMountedAuthRoutes("/api/auth", authRoutes);



app.use("/api/users", requireAuth, usersRoutes);

app.use("/api/jobs", requireAuth, jobRoutes);

app.use("/api/dashboard", requireAuth, dashboardRoutes);

app.use("/api/applications", requireAuth, applicationsRoutes);

app.use("/api/whatsapp", requireAuth, whatsappRoutes);

app.use("/api/activity", requireAuth, activityRoutes);

app.use("/api/socket", requireAuth, socketRoutes);

app.use("/api/analytics", requireAuth, analyticsRoutes);

app.use("/api/resumes", requireAuth, resumeRoutes);

app.use("/api/matching", requireAuth, matchingRoutes);

app.use("/api/telegram", requireAuth, telegramRoutes);



console.log("[Analytics] routes mounted");

console.log("[Resumes] routes mounted");

console.log("[Matching] routes mounted");

console.log("[Telegram] routes mounted");



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

