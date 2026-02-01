const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const Giveaway = require("../models/Giveaway");
const config = require("../config");
const { parseDuration } = require("../util/parseDuration");
const { formatDuration } = require("../util/time");
const { logToChannel } = require("../logger");

// Hard links from your plan (you can move these into config later if you want)
const PREMIUM_LINK =
  "https://discord.com/channels/1328816467411603619/1426993598578298952";

function setupStateDefaults() {
  return {
    title: "",
    description: "",
    winners: 1,
    prize: "",
    duration: "1h",
    premiumBenefits: false,
    premiumOnly: false,
    storePromotion: false,
  };
}

function buildSetupEmbed(state) {
  const ms = parseDuration(state.duration);
  const durPretty = ms ? `(${formatDuration(ms)})` : "(invalid)";

  const lines = [
    `**Title:** ${state.title ? state.title : "_(not set)_"} `,
    `**Description:** ${state.description ? state.description : "_(not set)_"} `,
    `**Amount of winners:** ${state.winners}`,
    `**Prize:** ${state.prize ? state.prize : "_(not set)_"} `,
    `**Duration:** ${state.duration} ${durPretty}`,
    `**Premium Benefits:** ${state.premiumBenefits ? "ON" : "OFF"}`,
    `**Premium Only:** ${state.premiumOnly ? "ON" : "OFF"}`,
    `**Store Promotion:** ${state.storePromotion ? "ON" : "OFF"}`,
  ];

  return new EmbedBuilder()
    .setTitle("Giveaway Setup")
    .setDescription(lines.join("\n"))
    .setColor(0x5865f2)
    .setFooter({ text: "Only you can see this setup panel." });
}

function buildSetupComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gw:set:title")
      .setLabel("Set Title")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gw:set:desc")
      .setLabel("Set Description")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gw:set:prize")
      .setLabel("Set Prize")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gw:set:winners")
      .setLabel("Set Winners")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("gw:set:duration")
      .setLabel("Set Duration")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gw:toggle:pb")
      .setLabel("Toggle Premium Benefits")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("gw:toggle:po")
      .setLabel("Toggle Premium Only")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("gw:toggle:sp")
      .setLabel("Toggle Store Promotion")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("gw:create")
      .setLabel("Create Giveaway")
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

function buildGiveawayEmbed(gw) {
  const premiumLine = gw.premiumOnly
    ? "✅ **Premium Only giveaway**"
    : "❌ **Not premium-only**";

  const pbLine = gw.premiumBenefits
    ? "✅ **Premium Benefits:** premium can enter twice (normal + ⭐)"
    : "❌ **Premium Benefits:** off";

  const storeLine = gw.storePromotion
    ? `🛒 Also available in our store: ${config.LINKS.STORE || "Store link not configured"}`
    : null;

  const endsInMs = Math.max(0, new Date(gw.endsAt).getTime() - Date.now());
  const endsIn = formatDuration(endsInMs);

  const entryCount = gw.entries?.length || 0;

  const desc = [
    gw.description || "",
    "",
    `**Prize:** ${gw.prize}`,
    `**Ends in:** ${endsIn}`,
    `**Entries:** ${entryCount}`,
    `**Amount of winners:** ${gw.winnersCount}`,
    "",
    premiumLine,
    pbLine,
    storeLine,
  ]
    .filter(Boolean)
    .join("\n");

  return new EmbedBuilder()
    .setTitle(gw.title || "Giveaway")
    .setDescription(desc)
    .setColor(0x2ecc71);
}

function buildGiveawayButtons(gw) {
  const row = new ActionRowBuilder();

  if (!gw.premiumOnly) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gw:enter:normal:${gw._id}`)
        .setLabel("Enter Giveaway")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`gw:enter:star:${gw._id}`)
      .setLabel("⭐ Enter Giveaway")
      .setStyle(ButtonStyle.Primary)
  );

  return [row];
}

function buildEndedEmbed(gw) {
  const winnersMentions = (gw.winners || []).map((id) => `<@${id}>`);
  const entriesCount = gw.entries?.length || 0;

  return new EmbedBuilder()
    .setTitle(`Giveaway for ${gw.prize} has ended`)
    .setDescription(
      [
        `**Entries:** ${entriesCount}`,
        `**Winners:** ${winnersMentions.length ? winnersMentions.join(", ") : "_No valid entries_"} `,
        "",
        `Create a ticket to redeem: ${config.LINKS.PREMIUM_INFO || "Ticket link not configured"}`,
      ].join("\n")
    )
    .setColor(0xe74c3c);
}

// in-memory per-user setup state
const setupState = new Map(); // userId => state

function isAdmin(interaction) {
  return interaction.memberPermissions?.has("Administrator");
}

function buildModal(customId, title, label, placeholder, style = TextInputStyle.Short) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(label)
    .setPlaceholder(placeholder)
    .setStyle(style)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleSlash(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "Admin only.", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    setupState.set(interaction.user.id, setupStateDefaults());

    return interaction.reply({
      ephemeral: true,
      embeds: [buildSetupEmbed(setupState.get(interaction.user.id))],
      components: buildSetupComponents(),
    });
  }

  if (sub === "end") {
    const messageId = interaction.options.getString("messageid", true);
    await interaction.deferReply({ ephemeral: true });

    const gw = await Giveaway.findOne({ guildId: interaction.guildId, messageId });
    if (!gw) return interaction.editReply("Giveaway not found for that messageId.");

    await forceEndGiveaway(gw, interaction.client, interaction.user.id);
    return interaction.editReply("✅ Giveaway force-ended.");
  }

  if (sub === "reroll") {
    const messageId = interaction.options.getString("messageid", true);
    await interaction.deferReply({ ephemeral: true });

    const gw = await Giveaway.findOne({ guildId: interaction.guildId, messageId });
    if (!gw) return interaction.editReply("Giveaway not found for that messageId.");

    if (!gw.ended) {
      return interaction.editReply("This giveaway hasn’t ended yet. Use `/giveaway end <messageId>` first.");
    }

    await rerollGiveaway(gw, interaction.client, interaction.user.id);
    return interaction.editReply("✅ Winners rerolled.");
  }
}

async function handleSetupButton(interaction) {
  const userId = interaction.user.id;
  const state = setupState.get(userId);

  if (!state) {
    return interaction.reply({
      content: "Setup expired. Run `/giveaway create` again.",
      ephemeral: true,
    });
  }

  const id = interaction.customId;

  // set fields => modal
  if (id === "gw:set:title")
    return interaction.showModal(
      buildModal("gw:modal:title", "Set Title", "Title", "My Giveaway")
    );
  if (id === "gw:set:desc")
    return interaction.showModal(
      buildModal(
        "gw:modal:desc",
        "Set Description",
        "Description",
        "Describe the giveaway",
        TextInputStyle.Paragraph
      )
    );
  if (id === "gw:set:prize")
    return interaction.showModal(
      buildModal("gw:modal:prize", "Set Prize", "Prize", "e.g. $25 Code")
    );
  if (id === "gw:set:winners")
    return interaction.showModal(
      buildModal(
        "gw:modal:winners",
        "Set Winners",
        "Amount of winners",
        "e.g. 3"
      )
    );
  if (id === "gw:set:duration")
    return interaction.showModal(
      buildModal(
        "gw:modal:duration",
        "Set Duration",
        "Duration",
        "e.g. 30m, 2h, 3d"
      )
    );

  // toggles
  if (id === "gw:toggle:pb") state.premiumBenefits = !state.premiumBenefits;
  if (id === "gw:toggle:po") state.premiumOnly = !state.premiumOnly;
  if (id === "gw:toggle:sp") state.storePromotion = !state.storePromotion;

  if (id.startsWith("gw:toggle:")) {
    setupState.set(userId, state);
    return interaction.update({
      embeds: [buildSetupEmbed(state)],
      components: buildSetupComponents(),
    });
  }

  // create giveaway
  if (id === "gw:create") {
    const ms = parseDuration(state.duration);
    if (!ms)
      return interaction.reply({
        content: "Invalid duration. Use like 30m / 2h / 3d.",
        ephemeral: true,
      });

    if (!state.title || !state.prize)
      return interaction.reply({
        content: "Please set at least Title and Prize.",
        ephemeral: true,
      });

    if (!Number.isFinite(state.winners) || state.winners < 1 || state.winners > 25) {
      return interaction.reply({
        content: "Winners must be between 1 and 25.",
        ephemeral: true,
      });
    }

    const endsAt = new Date(Date.now() + ms);

    const gw = await Giveaway.create({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,

      title: state.title,
      description: state.description,
      prize: state.prize,
      winnersCount: state.winners,
      durationMs: ms,

      premiumBenefits: state.premiumBenefits,
      premiumOnly: state.premiumOnly,
      storePromotion: state.storePromotion,

      endsAt,
    });

    const msg = await interaction.channel.send({
      embeds: [buildGiveawayEmbed(gw)],
      components: buildGiveawayButtons(gw),
    });

    gw.messageId = msg.id;
    await gw.save();

    setupState.delete(interaction.user.id);

    await logToChannel(interaction.client, `🎉 giveaway created: ${msg.url} by <@${interaction.user.id}>`);

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Giveaway created")
          .setDescription(`Posted in <#${interaction.channelId}>`)
          .setColor(0x2ecc71),
      ],
      components: [],
    });
  }
}

async function handleSetupModal(interaction) {
  const userId = interaction.user.id;
  const state = setupState.get(userId);

  if (!state) {
    return interaction.reply({
      content: "Setup expired. Run `/giveaway create` again.",
      ephemeral: true,
    });
  }

  const value = interaction.fields.getTextInputValue("value");
  const id = interaction.customId;

  if (id === "gw:modal:title") state.title = value.slice(0, 256);
  if (id === "gw:modal:desc") state.description = value.slice(0, 2000);
  if (id === "gw:modal:prize") state.prize = value.slice(0, 256);

  if (id === "gw:modal:winners") {
    const n = parseInt(value, 10);
    state.winners = Number.isFinite(n) ? n : 1;
  }

  if (id === "gw:modal:duration") state.duration = value.trim();

  setupState.set(userId, state);

  return interaction.reply({
    ephemeral: true,
    embeds: [buildSetupEmbed(state)],
    components: buildSetupComponents(),
  });
}

async function handleEnter(interaction, kind, giveawayId, client) {
  const gw = await Giveaway.findById(giveawayId);
  if (!gw) return interaction.reply({ content: "Giveaway not found.", ephemeral: true });

  if (gw.ended || new Date(gw.endsAt).getTime() <= Date.now()) {
    return interaction.reply({ content: "This giveaway has ended.", ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isPremium = member?.roles?.cache?.has(config.ROLES.PREMIUM);

  if (gw.premiumOnly && !isPremium) {
    return interaction.reply({
      ephemeral: true,
      content: `This giveaway is **Premium Only**. Get Premium here: ${PREMIUM_LINK}`,
    });
  }

  if (kind === "star" && !isPremium) {
    return interaction.reply({
      ephemeral: true,
      content: `⭐ requires Premium. Get Premium here: ${PREMIUM_LINK}`,
    });
  }

  const alreadySameKind = gw.entries.some((e) => e.userId === interaction.user.id && e.kind === kind);
  if (alreadySameKind) {
    return interaction.reply({ content: "You already entered via this button.", ephemeral: true });
  }

  if (!gw.premiumBenefits) {
    const anyAlready = gw.entries.some((e) => e.userId === interaction.user.id);
    if (anyAlready) {
      return interaction.reply({ content: "You already entered.", ephemeral: true });
    }
  }

  gw.entries.push({ userId: interaction.user.id, kind });
  await gw.save();

  // update message
  try {
    const ch = await client.channels.fetch(gw.channelId);
    const msg = await ch.messages.fetch(gw.messageId);
    await msg.edit({
      embeds: [buildGiveawayEmbed(gw)],
      components: buildGiveawayButtons(gw),
    });
  } catch {
    // ignore
  }

  return interaction.reply({ content: "✅ Entered!", ephemeral: true });
}

function drawWinners(entries, winnersCount) {
  const pool = entries.map((e) => e.userId);
  if (!pool.length) return [];

  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const winners = [];
  const picked = new Set();

  for (const userId of pool) {
    if (!picked.has(userId)) {
      winners.push(userId);
      picked.add(userId);
    }
    if (winners.length >= winnersCount) break;
  }

  return winners;
}

async function applyEndedState(gw, client, endedByUserId, reason) {
  gw.ended = true;
  gw.endsAt = new Date();

  const winners = drawWinners(gw.entries || [], gw.winnersCount || 1);
  gw.winners = winners;

  await gw.save();

  try {
    const ch = await client.channels.fetch(gw.channelId);
    const msg = await ch.messages.fetch(gw.messageId);

    await msg.edit({
      embeds: [buildEndedEmbed(gw)],
      components: [],
    });
  } catch {
    // ignore
  }

  await logToChannel(client, `🎉 giveaway ended (${reason}): messageId=${gw.messageId} by <@${endedByUserId}> winners=${(gw.winners||[]).join(",")}`);
}

async function forceEndGiveaway(gw, client, endedByUserId) {
  if (gw.ended) return;
  await applyEndedState(gw, client, endedByUserId, "force-end");
}

async function rerollGiveaway(gw, client, endedByUserId) {
  if (!gw.ended) return;

  const winners = drawWinners(gw.entries || [], gw.winnersCount || 1);
  gw.winners = winners;
  await gw.save();

  try {
    const ch = await client.channels.fetch(gw.channelId);
    const msg = await ch.messages.fetch(gw.messageId);

    await msg.edit({
      embeds: [buildEndedEmbed(gw)],
      components: [],
    });
  } catch {
    // ignore
  }

  await logToChannel(client, `🎲 giveaway reroll: messageId=${gw.messageId} by <@${endedByUserId}> winners=${(gw.winners||[]).join(",")}`);
}

async function endGiveawayIfNeeded(client) {
  const now = new Date();
  const due = await Giveaway.find({ ended: false, endsAt: { $lte: now } }).limit(25);

  for (const gw of due) {
    await applyEndedState(gw, client, gw.createdBy || "unknown", "timer");
  }
}

module.exports = {
  handleSlash,
  handleSetupButton,
  handleSetupModal,
  handleEnter,
  endGiveawayIfNeeded,
};
