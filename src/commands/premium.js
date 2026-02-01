const { ROLES, LINKS } = require("../config");
const Premium = require("../models/Premium");
const { formatDuration } = require("../util/time");

module.exports = {
  async handle(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasRole = member?.roles?.cache?.has(ROLES.PREMIUM);

    const doc = await Premium.findOne({ userId: interaction.user.id }).lean();
    const now = Date.now();

    if (hasRole && doc?.expiresAt) {
      const remaining = doc.expiresAt.getTime() - now;
      return interaction.reply({
        content: `Premium active ✅\nTime left: **${formatDuration(remaining)}**`,
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `No premium found.\n${LINKS.PREMIUM_INFO || "Premium info link not configured."}`,
      ephemeral: true
    });
  }
};
