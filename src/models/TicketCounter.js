const mongoose = require("mongoose");

const TicketCounterSchema = new mongoose.Schema(
  { key: { type: String, unique: true }, value: { type: Number, default: 0 } },
  { timestamps: true }
);

module.exports = mongoose.model("TicketCounter", TicketCounterSchema);
