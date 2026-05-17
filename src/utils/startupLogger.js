const startedAt = new Date().toISOString();

function log(phase, meta = {}) {
  const payload = {
    phase,
    at: new Date().toISOString(),
    pid: process.pid,
    ...meta,
  };
  console.log(`[Boot] ${phase} ${JSON.stringify(payload)}`);
}

module.exports = {
  startedAt,
  log,
};
