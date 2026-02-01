const mongoose = require("mongoose");

const TicketSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, index: true },
  openerId: String,
  seqNumber: Number,
  topic: String,
  status: { type: String, enum: ["open", "closed"], default: "open" },
  createdAt: Date,
  closedAt: Date,
});

module.exports = mongoose.model("Ticket", TicketSchema);
