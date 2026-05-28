/**
 * Shared helpers for analytics — safe when MongoDB is empty or unavailable.
 */

function buildDailySeries(rows, days = 7) {
  const series = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      name: d.toLocaleDateString("en-US", { weekday: "short" }),
      count: 0,
      apps: 0,
    });
  }
  const map = new Map(series.map((d) => [d.date, d]));
  for (const row of rows || []) {
    const entry = map.get(row._id);
    if (entry) {
      entry.count = row.count || 0;
      entry.apps = row.count || 0;
    }
  }
  return [...map.values()];
}

function pct(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

module.exports = { buildDailySeries, pct, isTelegramConfigured };
