const { CHANNELS } = require("../config");
const { logToChannel } = require("../logger");

module.exports = {
  async handle(interaction, client) {
    const query = interaction.options.getString("query", true);
    const reason = interaction.options.getString("reason", true);

    const logCh = await client.channels.fetch(CHANNELS.LOG);
    await logCh.send(`🧾 Report from <@${interaction.user.id}>: \`${query}\`\nReason: ${reason}`);

    await interaction.reply({ content: "Report submitted ✅", ephemeral: true });
    await logToChannel(client, `🧾 report: ${query} by <@${interaction.user.id}>`);
  },

  async autocomplete(interaction) {
    return interaction.respond([]);
  }
};
