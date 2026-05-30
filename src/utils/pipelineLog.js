/**
 * Structured pipeline logging for production tracing.
 */
function pipelineLog(phase, fields = {}) {
  const payload = {
    jobId: fields.jobId != null ? String(fields.jobId) : undefined,
    userId: fields.userId != null ? String(fields.userId) : undefined,
    title: fields.title || fields.role || undefined,
    status: fields.status || undefined,
    ...fields,
  };
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });
  console.log(`[Pipeline] ${phase}`, JSON.stringify(payload));
}

module.exports = { pipelineLog };
