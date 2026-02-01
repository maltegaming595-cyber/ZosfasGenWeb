const mongoose = require("mongoose");

const CodeStockSchema = new mongoose.Schema(
  {
    amount: { type: Number, enum: [25, 50, 75, 100], index: true, unique: true },
    codes: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CodeStock", CodeStockSchema);
