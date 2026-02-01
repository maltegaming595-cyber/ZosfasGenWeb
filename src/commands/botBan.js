const { isAdmin } = require("../util/perms");
const { parseDuration } = require("../util/parseDuration");
const BotBan = require("../models/BotBan");
const { logToChannel } = require("../logger");

module.exports = {
  async handle(interaction, client) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: "Admin only.", ephemeral: true });

    const user = interaction.options.getUser("user", true);
    const duration = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason", false) || "No reason provided";

    const ms = parseDuration(duration);
    if (!ms) return interaction.reply({ content: "Invalid duration (use 1d, 12h, 30m).", ephemeral: true });

    const expiresAt = new Date(Date.now() + ms);

    await BotBan.findOneAndUpdate(
      { userId: user.id },
      { userId: user.id, expiresAt, reason, bannedBy: interaction.user.id, bannedAt: new Date() },
      { upsert: true }
    );

    await logToChannel(client, `⛔ bot-ban: <@${user.id}> until ${expiresAt.toISOString()} by <@${interaction.user.id}> — ${reason}`);
    await interaction.reply({ content: `Bot-banned <@${user.id}> until ${expiresAt.toISOString()}`, ephemeral: true });
  }
};
