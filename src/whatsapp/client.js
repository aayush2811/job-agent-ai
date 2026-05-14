const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const calculateMatchScore = require("../jobs/matchScorer");
const extractJobData = require("../ai/regexExtractor");
const isJobRelated = require("../utils/jobFilter");
const Job = require("../jobs/job.model");
const autoApply = require("../jobs/autoApply");
const { sendErrorAlert } = require("../utils/errorNotifier");
console.log("🚀 Starting WhatsApp Client...");
const { sendJobNotification } = require("../telegram/bot");
const syncOldMessages = require("./syncOldMessages");

let whatsappStatus = "disconnected";
let hadConnectedOnce = false;

// Remote/local cached HTML can be out of sync with your Chrome session and trigger an extra
// navigation while `Client.inject()` runs → "Execution context was destroyed".
// `none` loads live web.whatsapp.com (no interception); most stable for auth + inject.
const webVersionCache = { type: "none" };

const puppeteerHeadless =
  process.env.WHATSAPP_HEADLESS === "false" ||
  process.env.WHATSAPP_HEADLESS === "0"
    ? false
    : true;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "job-agent",
  }),

  webVersionCache,

  // Old library default (Chrome 101) is a poor match for current WA Web.
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

  puppeteer: {
    headless: puppeteerHeadless,
    defaultViewport: null,

    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // Note: whatsapp-web.js also appends --disable-blink-features=AutomationControlled on launch.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
      "--disable-extensions",
    ],
  },

  takeoverOnConflict: true,
  takeoverTimeoutMs: 0,
});

function getWhatsappStatus() {
  return whatsappStatus;
}

const startWhatsApp = () => {
  client.on("change_state", (state) => {
    console.log("[WhatsApp] state change:", state);
  });

  client.on("loading_screen", (percent, message) => {
    whatsappStatus = "loading";
    console.log("[WhatsApp] loading:", percent, message);
  });

  client.on("qr", (qr) => {
    console.log("📱 Scan QR Below:");

    qrcode.generate(qr, {
      small: true,
    });
  });

  client.on("authenticated", () => {
    console.log("✅ WhatsApp Authenticated");
  });

  client.on("ready", () => {
    whatsappStatus = "connected";
    if (hadConnectedOnce) {
      console.log("[WhatsApp] 🔄 reconnected — client ready again");
    } else {
      console.log("✅ WhatsApp Ready");
    }
    hadConnectedOnce = true;
    setTimeout(() => {
      syncOldMessages(client);
    }, 10000);
  });

  client.on("auth_failure", (msg) => {
    whatsappStatus = "auth_failure";
    console.log("❌ Auth Failure:", msg);
    sendErrorAlert("WhatsApp Auth Failure", msg);
  });

  client.on("disconnected", (reason) => {
    whatsappStatus = "disconnected";
    console.log("❌ WhatsApp Disconnected:", reason);
    sendErrorAlert("WhatsApp Disconnected", reason);
  });

  client.on("message_create", async (message) => {
    try {
      const text = message.body;
      const messageId = message.id._serialized;

      console.log("\n📩 Message From:", message.from);
      console.log("👤 From Me:", message.fromMe);

      if (!text) return;

      const isJob = isJobRelated(text);

      if (!isJob) return;

      const existingJob = await Job.findOne({
        messageId,
      });

      if (existingJob) {
        console.log("⚠️ Already Exists - Message Skipped");
        return;
      }

      console.log("\n🤖 Extracting Job Data...\n");

      const extractedData = await extractJobData(text);

      console.log("✅ AI Extracted:");
      console.log(extractedData);

      if (!extractedData?.role || !extractedData?.email) {
        console.log("⚠️ Extraction Failed - Missing Role Or Email");

        return;
      }

      const duplicateJob = await Job.findOne({
        company: extractedData?.company || "",
        role: extractedData?.role || "",
        email: extractedData?.email || "",
      });

      if (duplicateJob) {
        console.log("⚠️ Duplicate Skipped:", {
          company: extractedData?.company || "",
          role: extractedData?.role || "",
          email: extractedData?.email || "",
        });

        return;
      }

      const alreadyApplied = await Job.findOne({
        company: extractedData?.company,

        role: extractedData?.role,

        applied: true,
      });

      if (alreadyApplied) {
        console.log("⚠️ Already Applied - Job Skipped");

        return;
      }

      const matchScore = calculateMatchScore(extractedData);
      if (matchScore < 70) {
        console.log(`⚠️ Low Score Ignored: ${matchScore}%`);

        return;
      }

      const newJob = await Job.create({
        messageId,
        text,

        company: extractedData?.company || "",

        role: extractedData?.role || "",

        location: extractedData?.location || "",

        email: extractedData?.email || "",

        skills: extractedData?.skills || [],

        experience: extractedData?.experience || "",
        matchScore,
      });

      console.log("\n🔥 New Job Saved");
      console.log(newJob);

      if (matchScore >= 90) {
        await autoApply(newJob);
        return;
      }

      console.log("🟡 Manual Approval Required");
      console.log(`🎯 Match Score: ${matchScore}%`);

      await sendJobNotification(newJob);
    } catch (error) {
      console.error("[WhatsApp] message processing error:", error?.message || error);
      await sendErrorAlert("WhatsApp Message Processing", error);
    }
  });

  client.initialize();
};

module.exports = Object.assign(startWhatsApp, {
  getWhatsappStatus,
});
