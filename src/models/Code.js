const mongoose = require("mongoose");

const CodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  amount: { type: Number, enum: [25, 50, 75, 100], index: true },
  used: { type: Boolean, default: false, index: true },
  usedBy: String,
  usedAt: Date,
  stockedAt: Date,
  stockedBy: String,
});

module.exports = mongoose.model("Code", CodeSchema);
