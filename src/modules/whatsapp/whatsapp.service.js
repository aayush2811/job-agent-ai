const { Client, LocalAuth } = require("whatsapp-web.js");
const { bindWhatsappEvents } = require("./whatsapp.events");
const { emitWhatsappStatus } = require("./whatsapp.socket");

const MAX_RECONNECT_ATTEMPTS = parseInt(
  process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || "8",
  10
);
const BASE_BACKOFF_MS = parseInt(
  process.env.WHATSAPP_RECONNECT_BASE_MS || "5000",
  10
);
const MAX_BACKOFF_MS = parseInt(
  process.env.WHATSAPP_RECONNECT_MAX_MS || "120000",
  10
);
const INIT_DELAY_MS = parseInt(process.env.WHATSAPP_INIT_DELAY_MS || "2500", 10);
const INIT_SETTLE_MS = parseInt(process.env.WHATSAPP_INIT_SETTLE_MS || "1500", 10);

const puppeteerHeadless =
  process.env.WHATSAPP_HEADLESS === "false" || process.env.WHATSAPP_HEADLESS === "0"
    ? false
    : true;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainFrameEarlyError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Requesting main frame too early") ||
    msg.includes("Execution context was destroyed") ||
    msg.includes("Target closed") ||
    msg.includes("Session closed")
  );
}

function buildClientOptions() {
  return {
    authStrategy: new LocalAuth({
      clientId: process.env.WHATSAPP_CLIENT_ID || "job-agent",
    }),
    webVersionCache: { type: "none" },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    puppeteer: {
      headless: puppeteerHeadless,
      defaultViewport: null,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
  };
}

class WhatsAppService {
  constructor() {
    this.client = null;
    this.status = "disconnected";
    this.isInitializing = false;
    this.isReady = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.hadConnectedOnce = false;
    this.shuttingDown = false;
    this.latestQr = null;
    this.lastError = null;
    this.lastEventAt = null;
    this._initPromise = null;
    this._reconnectTimer = null;
    this._syncTimer = null;
    this._wasReconnect = false;
    this._serverReady = false;
    this._mongoReady = false;
    this._listenersRegistered = false;
    this._destroying = false;
    this._lifecycleLock = Promise.resolve();
  }

  runExclusive(fn) {
    const run = this._lifecycleLock.then(() => fn());
    this._lifecycleLock = run.catch(() => {});
    return run;
  }

  log(level, event, meta = {}) {
    const payload = {
      channel: "whatsapp",
      event,
      status: this.status,
      isInitializing: this.isInitializing,
      isReady: this.isReady,
      reconnectAttempts: this.reconnectAttempts,
      ...meta,
    };
    this.lastEventAt = new Date().toISOString();
    const line = `[WhatsApp] ${event} ${JSON.stringify(payload)}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  setStatus(status) {
    this.status = status;
    if (status !== "connected") {
      this.isReady = false;
    }
    emitWhatsappStatus(this.getPublicState());
  }

  getPublicState() {
    return {
      status: this.status,
      isInitializing: this.isInitializing,
      isReady: this.isReady,
      isAuthenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts,
      hadConnectedOnce: this.hadConnectedOnce,
      hasQr: Boolean(this.latestQr),
      lastError: this.lastError,
      lastEventAt: this.lastEventAt,
    };
  }

  getWhatsappStatus() {
    return this.status;
  }

  getClient() {
    return this.client;
  }

  markMongoReady() {
    this._mongoReady = true;
  }

  markServerReady() {
    this._serverReady = true;
  }

  canStart() {
    return this._mongoReady && this._serverReady && !this.shuttingDown;
  }

  clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async waitForBrowserReady(client, timeoutMs = 60_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.shuttingDown) {
        throw new Error("Shutdown in progress");
      }
      try {
        const page = client.pupPage;
        if (!page || page.isClosed()) {
          await delay(500);
          continue;
        }
        const frame = page.mainFrame();
        if (frame && !frame.detached) {
          const url = page.url();
          if (url && url !== "about:blank") {
            await delay(INIT_SETTLE_MS);
            return;
          }
        }
      } catch {
        // page not ready yet
      }
      await delay(500);
    }
    throw new Error("Browser ready timeout");
  }

  createClientInstance() {
    const client = new Client(buildClientOptions());
    client.__jobAgentEventsBound = false;
    bindWhatsappEvents(client, this);
    return client;
  }

  async safeDestroyClient() {
    const client = this.client;
    this.client = null;
    this.isReady = false;
    this._destroying = true;

    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }

    if (!client) {
      this._destroying = false;
      return;
    }

    try {
      await Promise.race([
        client.destroy(),
        delay(15_000).then(() => {
          throw new Error("destroy timeout");
        }),
      ]);
    } catch (err) {
      this.log("warn", "destroy", { error: err?.message });
      try {
        const browser = client.pupBrowser;
        if (browser) {
          await browser.close();
        }
      } catch {
        // ignore
      }
    } finally {
      this._destroying = false;
    }
  }

  async initializeClientWithRetry() {
    return this.runExclusive(async () => {
      return this._initializeClientWithRetry();
    });
  }

  async _initializeClientWithRetry() {
    let lastErr;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.shuttingDown) return;

      try {
        await this.safeDestroyClient();
        await delay(INIT_SETTLE_MS * attempt);

        const client = this.createClientInstance();
        this.client = client;
        this.setStatus("initializing");

        await client.initialize();
        await this.waitForBrowserReady(client);

        this.log("info", "initialize_success", { attempt });
        return;
      } catch (err) {
        lastErr = err;
        this.lastError = err?.message || String(err);
        this.log("warn", "initialize_attempt_failed", {
          attempt,
          error: this.lastError,
          retriable: isMainFrameEarlyError(err),
        });
        await this.safeDestroyClient();

        if (!isMainFrameEarlyError(err) && attempt >= maxAttempts) {
          break;
        }
        await delay(INIT_SETTLE_MS * attempt * 2);
      }
    }

    throw lastErr || new Error("WhatsApp initialize failed");
  }

  async start() {
    if (process.env.WHATSAPP_ENABLED === "false" || process.env.WHATSAPP_ENABLED === "0") {
      this.setStatus("disabled");
      this.log("info", "start_skipped_disabled");
      return;
    }

    if (this.shuttingDown) {
      this.log("warn", "start_skipped_shutdown");
      return;
    }

    if (!this.canStart()) {
      this.log("warn", "start_deferred", {
        mongo: this._mongoReady,
        server: this._serverReady,
      });
      return;
    }

    if (this.isInitializing && this._initPromise) {
      return this._initPromise;
    }

    if (this.client && (this.isReady || this.status === "connected")) {
      this.log("info", "start_skipped_already_ready");
      return;
    }

    this._initPromise = this._runStart();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  async _runStart() {
    this.isInitializing = true;
    this.setStatus("starting");
    this.log("info", "start");

    try {
      if (INIT_DELAY_MS > 0) {
        await delay(INIT_DELAY_MS);
      }

      await this.initializeClientWithRetry();
    } catch (err) {
      this.lastError = err?.message || String(err);
      this.setStatus("error");
      this.log("error", "start_failed", { error: this.lastError });

      if (!this.shuttingDown) {
        this.scheduleReconnect("start_failed");
      }
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Fire-and-forget start — never throws; safe for bootstrap.
   */
  startSafe() {
    this.log("info", "start_safe");
    this.start().catch((err) => {
      this.lastError = err?.message || String(err);
      this.log("error", "start_safe_caught", { error: this.lastError });
      if (!this.shuttingDown) {
        this.scheduleReconnect("start_safe");
      }
    });
  }

  scheduleReconnect(reason) {
    if (this.shuttingDown || this._destroying) return;
    if (this._reconnectTimer) return;
    if (this.isInitializing) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus("reconnect_exhausted");
      this.log("error", "reconnect_exhausted", {
        reason,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts += 1;
    const backoff = Math.min(
      BASE_BACKOFF_MS * 2 ** (this.reconnectAttempts - 1),
      MAX_BACKOFF_MS
    );

    this._wasReconnect = this.hadConnectedOnce;
    this.setStatus("reconnecting");
    this.log("info", "reconnect_scheduled", {
      reason,
      attempt: this.reconnectAttempts,
      backoffMs: backoff,
    });

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this.shuttingDown) return;

      this.isInitializing = true;
      this.initializeClientWithRetry()
        .then(() => {
          this.log("info", "reconnect_success", {
            attempt: this.reconnectAttempts,
          });
        })
        .catch((err) => {
          this.lastError = err?.message || String(err);
          this.log("error", "reconnect_failed", { error: this.lastError });
          this.scheduleReconnect("reconnect_failed");
        })
        .finally(() => {
          this.isInitializing = false;
        });
    }, backoff);
  }

  async shutdown() {
    if (this.shuttingDown) return;
    return this.runExclusive(async () => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      this.log("info", "shutdown");

      this.clearReconnectTimer();
      this._initPromise = null;

      await this.safeDestroyClient();
      this.setStatus("stopped");
      this.isInitializing = false;
      this.isReady = false;
      this.isAuthenticated = false;
    });
  }

}

/** Process-wide singleton (survives hot reload within same process; nodemon replaces process). */
if (!global.__JOB_AGENT_WHATSAPP_SERVICE__) {
  global.__JOB_AGENT_WHATSAPP_SERVICE__ = new WhatsAppService();
}

module.exports = global.__JOB_AGENT_WHATSAPP_SERVICE__;
