const mongoose = require("mongoose");

const UsageDailySchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true }, // `${userId}:${YYYY-MM-DD}`
  userId: { type: String, index: true },
  day: { type: String, index: true },
  count: { type: Number, default: 0 },
  lastUsedAt: Date,
});

module.exports = mongoose.model("UsageDaily", UsageDailySchema);
