const mongoose = require("mongoose");

const PremiumSchema = new mongoose.Schema({
  userId: { type: String, unique: true, index: true },
  expiresAt: { type: Date, index: true },
  grantedBy: String,
  grantedAt: Date,
});

module.exports = mongoose.model("Premium", PremiumSchema);
