const mongoose = require("mongoose");

const DiscountCodeSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  amount: { type: Number, enum: [25, 50, 75, 100], index: true },
  used: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
  usedAt: { type: Date, default: null },
  usedBy: { type: String, default: null },
});

module.exports = mongoose.model("DiscountCode", DiscountCodeSchema);
