const { GITHUB } = require("../config");
const { githubZipInfo } = require("../util/github");

module.exports = {
  async handle(interaction) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      await interaction.reply({ content: "Admin only.", ephemeral: true });
      return;
    }

    const appid = interaction.options.getString("appid", true).trim();
    if (!/^\d+$/.test(appid)) {
      await interaction.reply({ content: "AppID must be numeric.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const info = await githubZipInfo(
      { repo: GITHUB.REPO, manifestUrl: GITHUB.MANIFEST_URL, fallbackTag: GITHUB.FALLBACK_TAG },
      appid
    );

    const url = info.url || "(no url)";
    const tag = info.tag || "(no tag)";
    const size = info.size != null ? `${info.size} bytes` : "unknown";

    if (!info.ok) {
      await interaction.editReply(
        `❌ Not found\n` +
        `AppID: \`${appid}\`\n` +
        `Tag: \`${tag}\`\n` +
        `URL: ${url}`
      );
      return;
    }

    await interaction.editReply(
      `✅ Found\n` +
      `AppID: \`${appid}\`\n` +
      `Tag: \`${tag}\`\n` +
      `Size: ${size}\n` +
      `URL: ${url}`
    );
  },
};
