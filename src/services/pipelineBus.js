const { EventEmitter } = require("events");

const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Pipeline events forwarded to Socket.IO */
const PIPELINE_EVENTS = [
  "job-created",
  "job-scored",
  "approval-pending",
  "approval-timeout",
  "approval-resolved",
  "job-applied",
  "application-failed",
  "application-retrying",
  "dashboard-update",
];

function emitPipeline(eventName, payload) {
  bus.emit(eventName, {
    event: eventName,
    ...payload,
    at: new Date().toISOString(),
  });
  bus.emit("_any", { name: eventName, payload });
}

module.exports = {
  pipelineBus: bus,
  emitPipeline,
  PIPELINE_EVENTS,
};
