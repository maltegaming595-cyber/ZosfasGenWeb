const { CHANNELS } = require("../config");
const { isNumeric, searchGamesByName } = require("../util/gameSearch");
const { logToChannel } = require("../logger");

module.exports = {
  async handle(interaction, client) {
    if (interaction.channelId !== CHANNELS.GENERATE_ONLY) {
      await interaction.reply({ content: "Use this command in the correct channel.", ephemeral: true });
      return;
    }

    const query = interaction.options.getString("query", true).trim();

    let appidOrQuery = query;
    if (!isNumeric(query)) {
      const matches = await searchGamesByName(query);
      if (matches.length === 1) appidOrQuery = matches[0].appid;
    }

    const ch = await client.channels.fetch(CHANNELS.UPDATE_REQUESTS);
    await ch.send(`📌 Update request from <@${interaction.user.id}>: \`${appidOrQuery}\``);

    await logToChannel(client, `🟨 update request: ${appidOrQuery} by <@${interaction.user.id}>`);
    await interaction.reply({ content: "Sent update request ✅", ephemeral: true });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "query") return;
    const q = String(focused.value || "").trim();
    if (!q) return interaction.respond([]);
    if (isNumeric(q)) return interaction.respond([{ name: `AppID ${q}`, value: q }]);

    const matches = await searchGamesByName(q);
    return interaction.respond(matches.slice(0, 10).map(m => ({
      name: `${m.name} (${m.appid})`.slice(0, 100),
      value: String(m.appid)
    })));
  }
};
