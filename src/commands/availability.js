const { GITHUB } = require("../config");
const { githubZipInfo } = require("../util/github");
const { formatBytes } = require("../util/time");
const { isNumeric, searchGamesByName } = require("../util/gameSearch");

module.exports = {
  async handle(interaction) {
    const query = interaction.options.getString("query", true).trim();
    let appid = null;

    if (isNumeric(query)) {
      appid = query;
    } else {
      const matches = await searchGamesByName(query);
      if (matches.length !== 1) {
        await interaction.reply({
          content: "Multiple/no matches — please use a numeric AppID.",
          ephemeral: true,
        });
        return;
      }
      appid = String(matches[0].appid);
    }

    await interaction.deferReply({ ephemeral: true });

    const info = await githubZipInfo(
      { repo: GITHUB.REPO, manifestUrl: GITHUB.MANIFEST_URL, fallbackTag: GITHUB.FALLBACK_TAG },
      appid
    );

    if (!info.ok) {
      await interaction.editReply(`❌ ZIP not found for AppID \`${appid}\`.`);
      return;
    }

    await interaction.editReply(
      `✅ ZIP found for AppID \`${appid}\`\n` +
      `Release: \`${info.tag}\`\n` +
      `Size: ${info.size ? formatBytes(info.size) : "Unknown"}`
    );
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "query") return;

    const q = String(focused.value || "").trim();
    if (!q) return interaction.respond([]);

    if (isNumeric(q)) {
      return interaction.respond([{ name: `AppID ${q}`, value: q }]);
    }

    const matches = await searchGamesByName(q);
    return interaction.respond(
      matches.slice(0, 10).map((m) => ({
        name: `${m.name} (${m.appid})`.slice(0, 100),
        value: String(m.appid),
      }))
    );
  },
};
