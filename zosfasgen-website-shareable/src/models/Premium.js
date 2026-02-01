const mongoose = require("mongoose");

const PremiumSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, unique: true },
    expiresAt: { type: Date, index: true },
    grantedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Premium", PremiumSchema);
