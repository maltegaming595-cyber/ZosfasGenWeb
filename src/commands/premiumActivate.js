const { isAdmin } = require("../util/perms");
const { ROLES } = require("../config");
const { parseDuration } = require("../util/parseDuration");
const Premium = require("../models/Premium");
const { logToChannel } = require("../logger");

module.exports = {
  async handle(interaction, client) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "Admin only.", ephemeral: true });
    }

    const user = interaction.options.getUser("user", true);
    const duration = interaction.options.getString("duration", true);
    const ms = parseDuration(duration);
    if (!ms) return interaction.reply({ content: "Invalid duration. Use like 7d, 12h, 30m.", ephemeral: true });

    const expiresAt = new Date(Date.now() + ms);

    await Premium.findOneAndUpdate(
      { userId: user.id },
      { userId: user.id, expiresAt, grantedBy: interaction.user.id, grantedAt: new Date() },
      { upsert: true }
    );

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.add(ROLES.PREMIUM).catch(() => {});

    await logToChannel(client, `⭐ premium-activate: <@${user.id}> until ${expiresAt.toISOString()} by <@${interaction.user.id}>`);
    await interaction.reply({ content: `Premium activated for <@${user.id}> until ${expiresAt.toISOString()}`, ephemeral: true });
  }
};
