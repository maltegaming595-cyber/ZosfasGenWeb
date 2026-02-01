const mongoose = require("mongoose");

const TicketCounterSchema = new mongoose.Schema({
  _id: { type: String, default: "global" },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("TicketCounter", TicketCounterSchema);
