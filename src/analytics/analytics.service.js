const Job = require("../jobs/job.model");
const Application = require("../models/application.model");
const ActivityLog = require("../models/activityLog.model");
const jobService = require("../jobs/job.service");
const { isDbReady } = require("../utils/dbGuard");

const EMPTY_DASHBOARD = {
  jobsByDay: [],
  applicationsByDay: [],
  avgMatchScoreByDay: [],
  funnel: { pending: 0, approved: 0, applied: 0, rejected: 0 },
};

function parseRangeMs(rangeParam) {
  const raw = String(rangeParam || "7d").trim().toLowerCase();
  const match = raw.match(/^(\d+)(d|h|w)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10) || 7;
  if (match[2] === "h") return n * 60 * 60 * 1000;
  if (match[2] === "w") return n * 7 * 24 * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}

function rangeStart(rangeParam) {
  return new Date(Date.now() - parseRangeMs(rangeParam));
}

function mapDaySeries(rows, valueKey = "count") {
  return rows.map((row) => ({
    date: row._id,
    [valueKey]: row[valueKey] ?? row.count ?? 0,
  }));
}

async function aggregateJobsByDay(since) {
  const rows = await Job.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        avgMatchScore: { $avg: "$matchScore" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    jobsByDay: mapDaySeries(rows),
    avgMatchScoreByDay: rows.map((row) => ({
      date: row._id,
      avgMatchScore: Math.round((row.avgMatchScore || 0) * 10) / 10,
    })),
  };
}

async function aggregateApplicationsByDay(since) {
  const rows = await Application.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return mapDaySeries(rows);
}

function buildFunnel(stats) {
  return {
    pending: stats.pending ?? 0,
    approved: stats.approved ?? 0,
    applied: (stats.autoApplied ?? 0) + (stats.approved ?? 0),
    rejected: stats.rejected ?? 0,
    failed: stats.failed ?? 0,
  };
}

async function getDashboardAnalytics(range = "7d") {
  const stats = await jobService.getJobStats();
  const payload = {
    ...EMPTY_DASHBOARD,
    summary: stats,
    range: range || "7d",
    funnel: buildFunnel(stats),
  };

  if (!isDbReady()) return payload;

  try {
    const since = rangeStart(range);
    const { jobsByDay, avgMatchScoreByDay } = await aggregateJobsByDay(since);
    const applicationsByDay = await aggregateApplicationsByDay(since);
    return {
      ...payload,
      jobsByDay,
      applicationsByDay,
      avgMatchScoreByDay,
    };
  } catch (err) {
    console.error("[Analytics] getDashboardAnalytics:", err?.message || err);
    return payload;
  }
}

async function getApplicationsAnalytics(range = "7d") {
  const empty = {
    range: range || "7d",
    totals: { all: 0, pending: 0, applying: 0, applied: 0, failed: 0, retrying: 0, rejected: 0 },
    byChannel: { auto: 0, manual_telegram: 0, manual_api: 0 },
    recent: [],
  };

  if (!isDbReady()) return empty;

  try {
    const since = rangeStart(range);
    const statusRows = await Application.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const channelRows = await Application.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$channel", count: { $sum: 1 } } },
    ]);

    const totals = { ...empty.totals };
    let all = 0;
    for (const row of statusRows) {
      const key = row._id;
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) {
        totals[key] = row.count || 0;
      }
      all += row.count || 0;
    }
    totals.all = all;

    const byChannel = { ...empty.byChannel };
    for (const row of channelRows) {
      if (row._id && Object.prototype.hasOwnProperty.call(byChannel, row._id)) {
        byChannel[row._id] = row.count || 0;
      }
    }

    const recent = await Application.find({ createdAt: { $gte: since } })
      .sort({ updatedAt: -1 })
      .limit(25)
      .populate("jobId", "company role matchScore status")
      .lean()
      .exec();

    return { range: range || "7d", totals, byChannel, recent };
  } catch (err) {
    console.error("[Analytics] getApplicationsAnalytics:", err?.message || err);
    return empty;
  }
}

async function getPipelineAnalytics() {
  const stats = await jobService.getJobStats();
  const stages = [
    { stage: "pending", count: stats.pending ?? 0 },
    { stage: "approved", count: stats.approved ?? 0 },
    { stage: "auto_applied", count: stats.autoApplied ?? 0 },
    { stage: "rejected", count: stats.rejected ?? 0 },
    { stage: "failed", count: stats.failed ?? 0 },
  ];

  const payload = {
    funnel: buildFunnel(stats),
    stages,
    totals: stats,
    applicationPipeline: {
      pending: 0,
      applying: 0,
      applied: 0,
      failed: 0,
      retrying: 0,
      rejected: 0,
    },
  };

  if (!isDbReady()) return payload;

  try {
    const appRows = await Application.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    for (const row of appRows) {
      if (row._id && Object.prototype.hasOwnProperty.call(payload.applicationPipeline, row._id)) {
        payload.applicationPipeline[row._id] = row.count || 0;
      }
    }
    return payload;
  } catch (err) {
    console.error("[Analytics] getPipelineAnalytics:", err?.message || err);
    return payload;
  }
}

async function getRealtimeAnalytics() {
  let socket = { status: "unknown", connections: 0 };
  try {
    const { getSocketState } = require("../sockets");
    socket = getSocketState();
  } catch (err) {
    socket = { status: "unavailable", error: err?.message };
  }

  let whatsapp = { status: "unavailable" };
  try {
    const whatsappService = require("../modules/whatsapp/whatsapp.service");
    whatsapp = whatsappService.getPublicState();
  } catch (err) {
    whatsapp = { status: "unavailable", lastError: err?.message };
  }

  const stats = await jobService.getJobStats();
  let recentActivity = [];

  if (isDbReady()) {
    try {
      recentActivity = await ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .select("type message severity createdAt jobId")
        .lean()
        .exec();
    } catch (err) {
      console.error("[Analytics] recentActivity:", err?.message || err);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    summary: stats,
    socket,
    whatsapp,
    recentActivity,
  };
}

module.exports = {
  getDashboardAnalytics,
  getApplicationsAnalytics,
  getPipelineAnalytics,
  getRealtimeAnalytics,
};
