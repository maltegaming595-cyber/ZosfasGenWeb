const mongoose = require("mongoose");

const BotBanSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, unique: true },
    expiresAt: { type: Date, index: true },
    reason: { type: String, default: "" },
    bannedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BotBan", BotBanSchema);
