const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const calculateMatchScore = require("../jobs/matchScorer");
const extractJobData = require("../ai/regexExtractor");
const isJobRelated = require("../utils/jobFilter");
const Job = require("../jobs/job.model");
console.log("🚀 Starting WhatsApp Client...");
const { sendJobNotification } = require("../telegram/bot");
const syncOldMessages = require("./syncOldMessages");
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

    executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // Note: whatsapp-web.js also appends --disable-blink-features=AutomationControlled on launch.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },

  takeoverOnConflict: true,
  takeoverTimeoutMs: 0,
});
const startWhatsApp = () => {
  client.on("change_state", (state) => {
    console.log("🔄 STATE:", state);
  });

  client.on("loading_screen", (percent, message) => {
    console.log("Loading:", percent, message);
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
    console.log("✅ WhatsApp Ready");
    syncOldMessages(client);
  });

  client.on("auth_failure", (msg) => {
    console.log("❌ Auth Failure:", msg);
  });

  client.on("disconnected", (reason) => {
    console.log("❌ WhatsApp Disconnected:", reason);
  });

  client.on("message_create", async (message) => {
    try {
      const text = message.body;
      console.log("\n📩 Message From:", message.from);
      console.log("👤 From Me:", message.fromMe);
      if (!text) return;

      const isJob = isJobRelated(text);

      if (!isJob) return;

      const existingJob = await Job.findOne({
        messageId: message.id._serialized,
      });

      const extractedData = await extractJobData(text);

      console.log("✅ AI Extracted:");
      console.log(extractedData);
      const alreadyApplied = await Job.findOne({
        company: extractedData?.company,

        role: extractedData?.role,

        applied: true,
      });

      if (alreadyApplied) {
        console.log("⚠️ Already Applied Previously");

        return;
      }
      if (existingJob) {
        console.log("⚠️ Already Exists");
        return;
      }

      console.log("\n🤖 Sending To AI...\n");

      const matchScore = calculateMatchScore(extractedData);
      if (matchScore < 60) {
        console.log("⚠️ Low Match Score Ignored");

        return;
      }
      console.log(`🎯 Match Score: ${matchScore}%`);
      const newJob = await Job.create({
        messageId: message.id._serialized,
        text,

        company: extractedData?.company || "",

        role: extractedData?.role || "",

        location: extractedData?.location || "",

        email: extractedData?.email || "",

        skills: extractedData?.skills || [],

        experience: extractedData?.experience || "",
        matchScore,
      });

      console.log("\n🔥 NEW JOB SAVED");
      console.log(newJob);
      await sendJobNotification(newJob);
    } catch (error) {
      console.log("❌ Message Error:", error.message);
    }
  });

  client.initialize();
};

module.exports = startWhatsApp;
