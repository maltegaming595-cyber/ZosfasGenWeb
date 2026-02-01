const mongoose = require("mongoose");

const BotBanSchema = new mongoose.Schema({
  userId: { type: String, unique: true, index: true },
  expiresAt: { type: Date, index: true },
  reason: String,
  bannedBy: String,
  bannedAt: Date,
});

module.exports = mongoose.model("BotBan", BotBanSchema);
