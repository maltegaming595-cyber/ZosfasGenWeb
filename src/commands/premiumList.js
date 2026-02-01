const { isAdmin } = require("../util/perms");
const Premium = require("../models/Premium");
const { formatDuration } = require("../util/time");

module.exports = {
  async handle(interaction) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: "Admin only.", ephemeral: true });

    const list = await Premium.find({ expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1 }).lean();
    if (!list.length) return interaction.reply({ content: "No premium users.", ephemeral: true });

    const now = Date.now();
    const lines = list.slice(0, 40).map(p => {
      const rem = p.expiresAt.getTime() - now;
      return `<@${p.userId}> — ${formatDuration(rem)}`;
    });

    await interaction.reply({ content: `Premium users:\n${lines.join("\n")}`, ephemeral: true });
  }
};
