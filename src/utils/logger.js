/**
 * PM2-friendly logger — verbose output only in development unless scoped for Socket lifecycle.
 */

const isProduction = process.env.NODE_ENV === "production";
const LOG_LEVEL = (process.env.LOG_LEVEL || (isProduction ? "info" : "debug")).toLowerCase();
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function shouldLog(level, scope) {
  if (LEVELS[level] < minLevel) return false;
  if (level === "debug" && isProduction) return false;
  if (level === "info" && isProduction && scope !== "Socket") return false;
  return true;
}

function write(level, scope, message, meta) {
  if (!shouldLog(level, scope)) return;
  const line = `[${scope}] ${message}`;
  if (level === "error") console.error(line, meta ?? "");
  else if (level === "warn") console.warn(line, meta ?? "");
  else console.log(line, meta ?? "");
}

module.exports = {
  isProduction,
  debug: (scope, msg, meta) => write("debug", scope, msg, meta),
  info: (scope, msg, meta) => write("info", scope, msg, meta),
  warn: (scope, msg, meta) => write("warn", scope, msg, meta),
  error: (scope, msg, meta) => write("error", scope, msg, meta),
};
