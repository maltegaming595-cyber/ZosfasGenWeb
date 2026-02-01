const mongoose = require("mongoose");

const GiveawaySchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true },
    channelId: { type: String, index: true },
    messageId: { type: String, index: true, unique: true },
    title: { type: String, default: "Giveaway" },
    winners: { type: Number, default: 1 },
    endsAt: { type: Date, index: true },
    ended: { type: Boolean, default: false },
    createdBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Giveaway", GiveawaySchema);
