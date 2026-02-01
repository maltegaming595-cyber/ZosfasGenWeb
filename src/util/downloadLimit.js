const UsageDaily = require("../models/UsageDaily");
const config = require("../config");
const { dayKey } = require("./time");

/**
 * Enforce the free daily limit (calendar day) while logging each download source.
 * Premium users bypass the limit.
 */
async function enforceDailyLimit(userId, isPremium, source = "unknown", resource = "") {
  if (isPremium) {
    // Still log for history, but do not limit.
    await logDownloadEvent(userId, source, resource).catch(() => {});
    return { ok: true, remaining: 0, limit: config.LIMITS.FREE_DAILY_GENERATIONS };
  }

  const day = dayKey();
  const key = `${userId}:${day}`;
  const doc = await UsageDaily.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, userId, day, count: 0 }, $set: { lastUsedAt: new Date() } },
    { upsert: true, new: true }
  );

  if (doc.count >= config.LIMITS.FREE_DAILY_GENERATIONS) {
    return { ok: false, remaining: 0, limit: config.LIMITS.FREE_DAILY_GENERATIONS };
  }

  doc.count += 1;
  await doc.save();
  await logDownloadEvent(userId, source, resource).catch(() => {});

  return {
    ok: true,
    remaining: Math.max(0, config.LIMITS.FREE_DAILY_GENERATIONS - doc.count),
    limit: config.LIMITS.FREE_DAILY_GENERATIONS,
  };
}

async function getDailyUsage(userId) {
  const day = dayKey();
  const key = `${userId}:${day}`;
  const doc = await UsageDaily.findOne({ key }).lean();
  return { day, count: doc?.count || 0 };
}

// --- Optional history (stored in a tiny collection to power the website "recent downloads" list) ---
const mongoose = require("mongoose");

const DownloadEventSchema = new mongoose.Schema({
  discordId: { type: String, index: true },
  source: { type: String, index: true },
  resource: String,
  createdAt: { type: Date, default: Date.now, index: true },
});

// Prevent OverwriteModelError on hot reloads
const DownloadEvent = mongoose.models.DownloadEvent || mongoose.model("DownloadEvent", DownloadEventSchema);

async function logDownloadEvent(discordId, source, resource) {
  if (!discordId) return;
  await DownloadEvent.create({ discordId, source, resource });
}

async function listRecentDownloads(discordId, limit = 10) {
  const rows = await DownloadEvent.find({ discordId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(50, limit)))
    .lean();
  return rows.map((r) => ({
    source: r.source,
    resource: r.resource,
    createdAt: r.createdAt,
  }));
}

module.exports = { enforceDailyLimit, getDailyUsage, listRecentDownloads };
