require("dotenv").config();

const express = require("express");

const connectDB = require("./database/db");
const startWhatsApp = require("./whatsapp/client");

const app = express();

app.use(express.json());

connectDB();

startWhatsApp();

app.get("/", (req, res) => {
  res.send("🚀 Job Agent AI Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});