const mongoose = require("mongoose");

const EntrySchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    kind: { type: String, enum: ["normal", "star"], required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GiveawaySchema = new mongoose.Schema({
  guildId: { type: String, index: true },
  channelId: { type: String, index: true },
  messageId: { type: String, index: true },

  createdBy: { type: String, index: true },

  title: { type: String, default: "" },
  description: { type: String, default: "" },
  prize: { type: String, default: "" },
  winnersCount: { type: Number, default: 1 },
  durationMs: { type: Number, default: 60 * 60 * 1000 },

  premiumBenefits: { type: Boolean, default: false },
  premiumOnly: { type: Boolean, default: false },
  storePromotion: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  endsAt: { type: Date, index: true },

  ended: { type: Boolean, default: false, index: true },
  winners: { type: [String], default: [] },

  entries: { type: [EntrySchema], default: [] },
});

module.exports = mongoose.model("Giveaway", GiveawaySchema);
