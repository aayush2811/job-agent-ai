require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { registerProcessHandlers } = require("./utils/processHandlers");
const { bootstrap, registerShutdownHandlers } = require("./bootstrap");
const startup = require("./utils/startupLogger");

registerProcessHandlers();
registerShutdownHandlers();

bootstrap().catch((err) => {
  console.error("[Boot] bootstrap error (process stays alive if HTTP is up):", err?.message || err);
  startup.log("boot_error", { error: err?.message || String(err) });
});
