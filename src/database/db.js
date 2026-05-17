const mongoose = require("mongoose");
const { sendErrorAlert } = require("../utils/errorNotifier");

const MONGO_RETRY_MS = parseInt(process.env.MONGO_RETRY_MS || "10000", 10);

let reconnectTimer = null;

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

async function connectDB() {
  if (!process.env.MONGO_URI) {
    console.warn("[DB] MONGO_URI missing — running without database");
    return false;
  }

  if (isMongoConnected()) {
    return true;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("[DB] MongoDB connected");
    return true;
  } catch (error) {
    console.error("[DB] connection failed:", error?.message || error);
    sendErrorAlert("MongoDB Connection Failed", error).catch(() => {});
    return false;
  }
}

function scheduleMongoReconnect(onConnected) {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (isMongoConnected()) return;

    const ok = await connectDB();
    if (ok && typeof onConnected === "function") {
      try {
        await onConnected();
      } catch (err) {
        console.error("[DB] onConnected hook failed:", err?.message || err);
      }
    }

    if (!isMongoConnected()) {
      scheduleMongoReconnect(onConnected);
    }
  }, MONGO_RETRY_MS);
}

function stopMongoReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function disconnectDB() {
  stopMongoReconnect();
  if (!isMongoConnected()) return;
  try {
    await mongoose.disconnect();
    console.log("[DB] MongoDB disconnected");
  } catch (err) {
    console.warn("[DB] disconnect warning:", err?.message || err);
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  isMongoConnected,
  scheduleMongoReconnect,
  stopMongoReconnect,
};
