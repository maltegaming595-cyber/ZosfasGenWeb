const mongoose = require("mongoose");

const TicketSchema = new mongoose.Schema(
  {
    channelId: { type: String, index: true, unique: true },
    guildId: { type: String, index: true },
    userId: { type: String, index: true },
    topic: { type: String, default: "" },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    deleteAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ticket", TicketSchema);
