const { isAdmin } = require("../util/perms");
const mongoose = require("mongoose");
const Premium = require("../models/Premium");
const BotBan = require("../models/BotBan");
const UsageDaily = require("../models/UsageDaily");
const { dayKey } = require("../util/time");

module.exports = {
  async handle(interaction) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: "Admin only.", ephemeral: true });

    const up = process.uptime();
    const prem = await Premium.countDocuments({ expiresAt: { $gt: new Date() } });
    const bans = await BotBan.countDocuments({ expiresAt: { $gt: new Date() } });

    const today = dayKey();
    const todayTotal = await UsageDaily.aggregate([
      { $match: { day: today } },
      { $group: { _id: null, total: { $sum: "$count" } } }
    ]);
    const genTotal = todayTotal?.[0]?.total ?? 0;

    await interaction.reply({
      content:
        `Status:\n` +
        `Uptime: ${Math.floor(up)}s\n` +
        `Mongo: ${mongoose.connection.readyState === 1 ? "connected" : "not connected"}\n` +
        `Premium active: ${prem}\n` +
        `Bot bans active: ${bans}\n` +
        `Generations today (UTC): ${genTotal}`,
      ephemeral: true
    });
  }
};
