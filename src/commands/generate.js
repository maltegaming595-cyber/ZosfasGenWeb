const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const { CHANNELS, GITHUB, ROLES } = require("../config");
const { githubZipInfo } = require("../util/github");
const { formatBytes } = require("../util/time");
const { logToChannel } = require("../logger");
const { enforceDailyLimit } = require("../util/downloadLimit");
const { isNumeric, searchGamesByName } = require("../util/gameSearch");

function ghCfg() {
  return {
    repo: GITHUB.REPO,
    manifestUrl: GITHUB.MANIFEST_URL,
    fallbackTag: GITHUB.FALLBACK_TAG,
  };
}

async function isPremiumMember(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  return !!member?.roles?.cache?.has(ROLES.PREMIUM);
}

function buildGameEmbed({ name, appid, sizeBytes, url }) {
  const e = new EmbedBuilder()
    .setTitle(name || `Game ${appid}`)
    .setDescription("Click the button below to download.")
    .addFields(
      { name: "Steam ID", value: String(appid), inline: true },
      { name: "File Size", value: sizeBytes ? formatBytes(sizeBytes) : "Unknown", inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Download").setURL(url)
  );

  return { embed: e, components: [row] };
}

function buildSelectMenu(matches, originalQuery, action) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`pick:${action}:${Date.now()}`)
    .setPlaceholder("Select the correct game…")
    .addOptions(
      matches.slice(0, 10).map((m) => ({
        label: m.name.slice(0, 100),
        description: `AppID: ${m.appid}`,
        value: String(m.appid),
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);
  return { row, info: `Multiple matches for **${originalQuery}** — pick one:` };
}

module.exports = {
  async handle(interaction, client) {
    if (interaction.channelId !== CHANNELS.GENERATE_ONLY) {
      await interaction.reply({ content: "Use this command in the correct channel.", ephemeral: true });
      return;
    }

    const query = interaction.options.getString("query", true).trim();
    const guild = interaction.guild;

    const premium = await isPremiumMember(guild, interaction.user.id);
    const lim = await enforceDailyLimit(interaction.user.id, premium, "discord", query);
    if (!lim.ok) {
      await interaction.reply({
        content: `Daily limit reached (${lim.limit}/day). Premium users have no limit.`,
        ephemeral: true
      });
      return;
    }

    // Numeric AppID
    if (isNumeric(query)) {
      await interaction.deferReply({ ephemeral: true });

      const info = await githubZipInfo(ghCfg(), query);
      if (!info.ok) {
        await interaction.editReply(`ZIP not found for AppID \`${query}\`. Use /update to request it.`);
        return;
      }

      const out = await client.channels.fetch(CHANNELS.OUTPUT);
      const payload = buildGameEmbed({
        name: `Steam AppID ${query}`,
        appid: query,
        sizeBytes: info.size,
        url: info.url
      });

      await out.send({ embeds: [payload.embed], components: payload.components });

      await logToChannel(client, `✅ generate: ${query} by <@${interaction.user.id}> (premium=${premium})`);
      await interaction.editReply(`Posted download embed for \`${query}\` in <#${CHANNELS.OUTPUT}>.`);
      return;
    }

    // Name search
    await interaction.deferReply({ ephemeral: true });

    const matches = await searchGamesByName(query);
    if (!matches.length) {
      await interaction.editReply(`No matches found for **${query}**.`);
      return;
    }

    if (matches.length === 1) {
      const appid = String(matches[0].appid);
      const info = await githubZipInfo(ghCfg(), appid);
      if (!info.ok) {
        await interaction.editReply(`Found **${matches[0].name}** (${appid}) but ZIP is missing. Use /update.`);
        return;
      }

      const out = await client.channels.fetch(CHANNELS.OUTPUT);
      const payload = buildGameEmbed({
        name: matches[0].name,
        appid,
        sizeBytes: info.size,
        url: info.url
      });

      await out.send({ embeds: [payload.embed], components: payload.components });
      await interaction.editReply(`Posted **${matches[0].name}** in <#${CHANNELS.OUTPUT}>.`);
      return;
    }

    const { row, info } = buildSelectMenu(matches, query, "generate");
    await interaction.editReply({ content: info, components: [row] });
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
    const choices = matches.slice(0, 10).map((m) => ({
      name: `${m.name} (${m.appid})`.slice(0, 100),
      value: String(m.appid),
    }));

    return interaction.respond(choices);
  },

  async handleSelect(interaction, client) {
    const picked = interaction.values?.[0];
    const action = interaction.customId.split(":")[1];

    if (!picked) return;

    if (action === "generate" && interaction.channelId !== CHANNELS.GENERATE_ONLY) {
      await interaction.reply({ content: "Wrong channel.", ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    const info = await githubZipInfo(ghCfg(), picked);
    if (!info.ok) {
      await interaction.editReply({ content: `ZIP missing for AppID \`${picked}\`. Use /update.`, components: [] });
      return;
    }

    const out = await client.channels.fetch(CHANNELS.OUTPUT);
    const payload = buildGameEmbed({
      name: `Steam AppID ${picked}`,
      appid: picked,
      sizeBytes: info.size,
      url: info.url
    });

    await out.send({ embeds: [payload.embed], components: payload.components });
    await interaction.editReply({ content: `Posted \`${picked}\` in <#${CHANNELS.OUTPUT}>.`, components: [] });
  }
};
