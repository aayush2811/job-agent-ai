const mongoose = require("mongoose");
const { sendErrorAlert } = require("../utils/errorNotifier");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.log("❌ DB Error:", error.message);
    sendErrorAlert("MongoDB Connection Failed", error)
      .catch((e) => console.error("[DB] error alert failed:", e?.message || e))
      .finally(() => process.exit(1));
  }
};

module.exports = connectDB;