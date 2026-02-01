const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./src/config");
const { connectMongo } = require("./src/mongo");
const { startWebServer } = require("./src/web/server");
const { logToChannel } = require("./src/logger");

const Premium = require("./src/models/Premium");
const BotBan = require("./src/models/BotBan");
const TicketCounter = require("./src/models/TicketCounter");
const Ticket = require("./src/models/Ticket");
const { buildTranscriptAttachment } = require("./src/util/transcript");
const { isAdmin } = require("./src/util/perms");

// Commands
const generate = require("./src/commands/generate");
const update = require("./src/commands/update");
const availability = require("./src/commands/availability");
const report = require("./src/commands/report");
const premium = require("./src/commands/premium");
const boost = require("./src/commands/boost");
const dlc = require("./src/commands/dlc");
const online = require("./src/commands/online");
const store = require("./src/commands/store");

const premiumActivate = require("./src/commands/premiumActivate");
const premiumList = require("./src/commands/premiumList");
const botBan = require("./src/commands/botBan");
const status = require("./src/commands/status");

// Tickets
const ticketEmbed = require("./src/commands/ticketEmbed");

// Giveaways (kept as-is; we’ll fix registration after ticket changes)
const giveaway = require("./src/commands/giveaway");

process.on("unhandledRejection", (err) => console.error("unhandledRejection", err));
process.on("uncaughtException", (err) => console.error("uncaughtException", err));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

client.on("error", (err) => console.error("client error", err));

// ---- Premium expiry sweep removes role when time runs out
async function premiumExpirySweep() {
  const now = new Date();
  const expired = await Premium.find({ expiresAt: { $lte: now } }).lean();
  if (!expired.length) return;

  for (const p of expired) {
    try {
      for (const guild of client.guilds.cache.values()) {
        const member = await guild.members.fetch(p.userId).catch(() => null);
        if (member) await member.roles.remove(config.ROLES.PREMIUM).catch(() => {});
      }
      await Premium.deleteOne({ userId: p.userId }).catch(() => {});
      await logToChannel(client, `⌛ Premium expired: <@${p.userId}>`);
    } catch {}
  }
}

async function botBanSweep() {
  const now = new Date();
  await BotBan.deleteMany({ expiresAt: { $lte: now } }).catch(() => {});
}

async function nextTicketNumber() {
  const doc = await TicketCounter.findOneAndUpdate(
    { _id: "global" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

async function ensureAllowedGuild(interaction) {
  if (!config.OPTIONAL.allowedGuildId) return true;
  return interaction.guildId === config.OPTIONAL.allowedGuildId;
}

// ---- Ticket topic tracking per user
// Values: game|premium|glitches|other
const lastTopicByUser = new Map();
// When topic is "other", user types text here
const lastOtherTextByUser = new Map();

// ---- Pending delete countdowns per ticket channel
// channelId -> { canceled:boolean, timeout:NodeJS.Timeout|null, interval:NodeJS.Timeout|null }
const pendingDeletes = new Map();

function topicLabel(topic) {
  switch (topic) {
    case "game": return "Game";
    case "premium": return "Premium";
    case "glitches": return "Glitches";
    case "other": return "Other";
    default: return "Other";
  }
}

async function openTicket(interaction) {
  if (!config.FEATURES.TICKETS) {
    await interaction.reply({ content: "Tickets are currently disabled.", ephemeral: true }).catch(() => {});
    return null;
  }

  const guild = interaction.guild;
  const opener = interaction.user;

  const member = await guild.members.fetch(opener.id).catch(() => null);
  const isPrem = member?.roles?.cache?.has(config.ROLES.PREMIUM);

  const baseTopic = lastTopicByUser.get(opener.id) || "other";
  let topicText = topicLabel(baseTopic);

  if (baseTopic === "other") {
    const custom = (lastOtherTextByUser.get(opener.id) || "").trim();
    topicText = custom ? `Other: ${custom}` : "Other";
  }

  const seq = await nextTicketNumber();
  const padded = String(seq).padStart(4, "0");
  const name = isPrem ? `⭐ticket-${padded}` : `ticket-${padded}`;

  const channel = await guild.channels.create({
    name,
    parent: config.TICKETS.CATEGORY,
    reason: `Ticket opened by ${opener.tag}`,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ["ViewChannel"] },
      { id: opener.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      { id: config.ROLES.SUPPORT, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
    ],
  });

  await Ticket.create({
    channelId: channel.id,
    openerId: opener.id,
    seqNumber: seq,
    topic: topicText,
    status: "open",
    createdAt: new Date(),
  });

  await channel.send(
    `Hello <@${opener.id}>! Support will be with you soon.\n` +
      `Topic: **${topicText}**\n\n` +
      `When you’re done, click **Close Ticket** below.\n` +
      `After closing, you can delete the ticket manually, otherwise it auto-deletes in 24h.`
  );

  await channel.send({
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 4, custom_id: "ticket-close-btn", label: "Close Ticket" },
        ],
      },
    ],
  });

  await logToChannel(client, `🎫 ticket-open: ${channel.name} by <@${opener.id}> topic="${topicText}"`);
  return channel;
}

function canManageTicket(interaction, openerId) {
  // allow opener, support, or admin
  if (interaction.user.id === openerId) return true;
  if (interaction.memberPermissions?.has("Administrator")) return true;
  const member = interaction.member;
  if (member?.roles?.cache?.has(config.ROLES.SUPPORT)) return true;
  return false;
}

async function promptDeleteAfterClose(channel, openerId) {
  // message with "Delete Ticket" button
  await channel.send({
    content:
      `✅ Ticket closed.\n` +
      `If you’re done, you can delete this ticket now.\n` +
      `If you don’t, it will be deleted automatically in **24 hours**.`,
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 4, custom_id: "ticket-delete-btn", label: "Delete Ticket" },
        ],
      },
    ],
  }).catch(() => {});
}

async function startDeleteCountdown(interaction, channel, openerId) {
  // prevent multiple overlapping countdowns
  const existing = pendingDeletes.get(channel.id);
  if (existing) {
    return interaction.reply({ content: "A delete countdown is already running.", ephemeral: true }).catch(() => {});
  }

  if (!canManageTicket(interaction, openerId)) {
    return interaction.reply({ content: "You don’t have permission to delete this ticket.", ephemeral: true }).catch(() => {});
  }

  let seconds = 5;

  const msg = await channel.send({
    content: `🗑️ Deleting this ticket in **${seconds}** seconds…`,
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, custom_id: "ticket-cancel-delete-btn", label: "Cancel" },
        ],
      },
    ],
  }).catch(() => null);

  const state = { canceled: false, timeout: null, interval: null, messageId: msg?.id || null };
  pendingDeletes.set(channel.id, state);

  state.interval = setInterval(async () => {
    seconds -= 1;
    if (seconds <= 0) return;
    try {
      if (msg) await msg.edit(`🗑️ Deleting this ticket in **${seconds}** seconds…`);
    } catch {}
  }, 1000);

  state.timeout = setTimeout(async () => {
    try {
      const st = pendingDeletes.get(channel.id);
      if (!st || st.canceled) return;

      // best effort final edit
      try {
        if (msg) await msg.edit({ content: "🗑️ Deleting now…", components: [] });
      } catch {}

      await channel.delete("Ticket deleted via countdown");
    } catch {
      // ignore
    } finally {
      const st2 = pendingDeletes.get(channel.id);
      if (st2?.interval) clearInterval(st2.interval);
      pendingDeletes.delete(channel.id);
    }
  }, 5000);

  await interaction.reply({ content: "Started delete countdown.", ephemeral: true }).catch(() => {});
}

async function cancelDeleteCountdown(interaction, channel) {
  const st = pendingDeletes.get(channel.id);
  if (!st) {
    return interaction.reply({ content: "No active countdown to cancel.", ephemeral: true }).catch(() => {});
  }

  st.canceled = true;
  if (st.timeout) clearTimeout(st.timeout);
  if (st.interval) clearInterval(st.interval);

  pendingDeletes.delete(channel.id);

  try {
    await interaction.message.edit({ content: "✅ Deletion canceled.", components: [] });
  } catch {}

  await interaction.reply({ content: "Canceled deletion.", ephemeral: true }).catch(() => {});
}

async function closeTicket(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      if (interaction.isButton?.()) await interaction.deferUpdate();
      else await interaction.deferReply({ ephemeral: true });
    }
  } catch {}

  const channel = interaction.channel;
  const t = await Ticket.findOne({ channelId: channel.id }).lean();
  if (!t) {
    try {
      if (interaction.isButton?.()) {
        await interaction.followUp({ content: "This doesn’t look like a ticket channel.", ephemeral: true });
      } else {
        await interaction.editReply({ content: "This doesn’t look like a ticket channel." });
      }
    } catch {}
    return;
  }

  // Close perms for opener
  await channel.permissionOverwrites.edit(t.openerId, { SendMessages: false }).catch(() => {});

  // Transcript to log channel (best effort)
  try {
    const attachment = await buildTranscriptAttachment(channel);
    const logCh = await client.channels.fetch(config.CHANNELS.LOG).catch(() => null);
    if (logCh) {
      await logCh.send({
        content: `📄 Ticket transcript: **${channel.name}** (opener <@${t.openerId}>)`,
        files: [attachment],
      });
    }
  } catch {}

  await Ticket.updateOne({ channelId: channel.id }, { status: "closed", closedAt: new Date() }).catch(() => {});

  await channel.send(`✅ Ticket closed.`).catch(() => {});
  await promptDeleteAfterClose(channel, t.openerId);

  await logToChannel(client, `🎫 ticket-close: ${channel.name} by <@${interaction.user.id}>`);

  // Auto-delete after 24h if not manually deleted
  setTimeout(async () => {
    try {
      // if channel already deleted, this throws; ignore
      await channel.delete("Ticket auto-delete after 24h");
    } catch {}
  }, config.TICKETS.DELETE_AFTER_MS);

  try {
    if (!interaction.isButton?.()) {
      await interaction.editReply({ content: "Ticket closed." });
    }
  } catch {}
}

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await logToChannel(client, "✅ Bot online");

  setInterval(premiumExpirySweep, 60 * 1000);
  setInterval(botBanSweep, 60 * 1000);

  if (config.FEATURES.GIVEAWAYS) {
    setInterval(() => giveaway.endGiveawayIfNeeded(client), 15 * 1000);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.guildId && !(await ensureAllowedGuild(interaction))) {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: "This bot is not enabled in this server.", ephemeral: true }).catch(() => {});
      }
      return;
    }

    // ---- MODALS: Ticket "Other" topic input
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ticket-other-topic-modal") {
        const txt = (interaction.fields.getTextInputValue("ticket-other-topic") || "").trim();
        if (txt) lastOtherTextByUser.set(interaction.user.id, txt);
        lastTopicByUser.set(interaction.user.id, "other");
        await interaction.reply({ content: `Topic set: **Other: ${txt || "Other"}**`, ephemeral: true }).catch(() => {});
        return;
      }

      // Giveaway modals (unchanged)
      if (interaction.customId.startsWith("gw:modal:")) {
        if (!config.FEATURES.GIVEAWAYS) {
          return interaction.reply({ content: "Giveaways are disabled.", ephemeral: true }).catch(() => {});
        }
        return giveaway.handleSetupModal(interaction);
      }
    }

    // ---- AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      const name = interaction.commandName;
      if (["generate", "gen", "request"].includes(name)) return generate.autocomplete(interaction);
      if (name === "update") return update.autocomplete(interaction);
      if (name === "availability") return availability.autocomplete(interaction);
      if (name === "report") return report.autocomplete(interaction);
      return;
    }

    // ---- SELECT MENUS
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("pick:")) return generate.handleSelect(interaction, client);

      if (interaction.customId === "ticket-topic") {
        const val = interaction.values?.[0] || "other";
        lastTopicByUser.set(interaction.user.id, val);

        if (val !== "other") {
          await interaction.reply({ content: `Topic selected: **${topicLabel(val)}**`, ephemeral: true }).catch(() => {});
          return;
        }

        // For "Other" we just record choice; the modal will show when opening ticket
        await interaction.reply({ content: "Topic selected: **Other** (you will type it when opening).", ephemeral: true }).catch(() => {});
        return;
      }
    }

    // ---- BUTTONS
    if (interaction.isButton()) {
      // Tickets
      if (interaction.customId === "ticket-open-btn") {
        if (!config.FEATURES.TICKETS) {
          return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
        }

        const baseTopic = lastTopicByUser.get(interaction.user.id) || "other";
        if (baseTopic === "other") {
          // show modal to type other topic before opening
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
          const modal = new ModalBuilder()
            .setCustomId("ticket-other-topic-modal")
            .setTitle("Other topic");

          const input = new TextInputBuilder()
            .setCustomId("ticket-other-topic")
            .setLabel("Type your ticket topic")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("e.g. Account issue, installation help…");

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
          return;
        }

        const ch = await openTicket(interaction);
        if (ch) await interaction.reply({ content: `Ticket created: <#${ch.id}>`, ephemeral: true }).catch(() => {});
        return;
      }

      if (interaction.customId === "ticket-close-btn") {
        if (!config.FEATURES.TICKETS) {
          return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
        }
        return closeTicket(interaction);
      }

      if (interaction.customId === "ticket-delete-btn") {
        if (!config.FEATURES.TICKETS) {
          return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
        }

        const t = await Ticket.findOne({ channelId: interaction.channel.id }).lean();
        if (!t) return interaction.reply({ content: "Not a ticket channel.", ephemeral: true }).catch(() => {});
        if (t.status !== "closed") {
          return interaction.reply({ content: "Close the ticket first, then delete it.", ephemeral: true }).catch(() => {});
        }

        return startDeleteCountdown(interaction, interaction.channel, t.openerId);
      }

      if (interaction.customId === "ticket-cancel-delete-btn") {
        if (!config.FEATURES.TICKETS) {
          return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
        }
        return cancelDeleteCountdown(interaction, interaction.channel);
      }

      // Giveaway buttons (unchanged)
      if (
        interaction.customId.startsWith("gw:set:") ||
        interaction.customId.startsWith("gw:toggle:") ||
        interaction.customId === "gw:create"
      ) {
        if (!config.FEATURES.GIVEAWAYS) {
          return interaction.reply({ content: "Giveaways are disabled.", ephemeral: true }).catch(() => {});
        }
        return giveaway.handleSetupButton(interaction);
      }

      if (interaction.customId.startsWith("gw:enter:")) {
        if (!config.FEATURES.GIVEAWAYS) {
          return interaction.reply({ content: "Giveaways are disabled.", ephemeral: true }).catch(() => {});
        }
        const parts = interaction.customId.split(":");
        const kind = parts[2];
        const giveawayId = parts[3];
        return giveaway.handleEnter(interaction, kind, giveawayId, client);
      }

      return;
    }

    // ---- SLASH COMMANDS
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;
    const isTicketCmd = cmd.startsWith("ticket-");

    // Bot-ban blocks everything except ticket commands
    if (!isTicketCmd) {
      const ban = await BotBan.findOne({ userId: interaction.user.id }).lean();
      if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) {
        await interaction.reply({ content: "You are bot-banned from using commands.", ephemeral: true }).catch(() => {});
        return;
      }
    }

    // Dispatch
    if (cmd === "giveaway") {
      if (!config.FEATURES.GIVEAWAYS) {
        return interaction.reply({ content: "Giveaways are disabled.", ephemeral: true }).catch(() => {});
      }
      return giveaway.handleSlash(interaction);
    }

    if (["generate", "gen", "request"].includes(cmd)) return generate.handle(interaction, client);
    if (cmd === "update") return update.handle(interaction, client);
    if (cmd === "availability") return availability.handle(interaction);
    if (cmd === "report") return report.handle(interaction, client);

    if (cmd === "premium") return premium.handle(interaction);
    if (cmd === "boost") return boost.handle(interaction);
    if (cmd === "dlc") return dlc.handle(interaction);
    if (cmd === "online") return online.handle(interaction);
    if (cmd === "store") return store.handle(interaction);

    if (cmd === "premium-activate") return premiumActivate.handle(interaction, client);
    if (cmd === "premium-list") return premiumList.handle(interaction);
    if (cmd === "bot-ban") return botBan.handle(interaction, client);
    if (cmd === "status") return status.handle(interaction);

    // Tickets
    if (cmd === "ticket-embed") {
      if (!config.FEATURES.TICKETS) return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
      return ticketEmbed.handle(interaction);
    }

    if (cmd === "ticket-open") {
      if (!config.FEATURES.TICKETS) return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
      const ch = await openTicket(interaction);
      if (ch) return interaction.reply({ content: `Ticket created: <#${ch.id}>`, ephemeral: true }).catch(() => {});
      return;
    }

    if (cmd === "ticket-close") {
      if (!config.FEATURES.TICKETS) return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
      return closeTicket(interaction);
    }

    if (cmd === "ticket-delete") {
      if (!config.FEATURES.TICKETS) return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
      if (!isAdmin(interaction.member)) return interaction.reply({ content: "Admin only.", ephemeral: true }).catch(() => {});
      // countdown for admin delete too
      const t = await Ticket.findOne({ channelId: interaction.channel.id }).lean();
      if (!t) return interaction.reply({ content: "Not a ticket channel.", ephemeral: true }).catch(() => {});
      if (t.status !== "closed") return interaction.reply({ content: "Close the ticket first, then delete it.", ephemeral: true }).catch(() => {});
      return startDeleteCountdown(interaction, interaction.channel, t.openerId);
    }

    if (cmd === "ticket-add") {
      if (!config.FEATURES.TICKETS) return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
      const user = interaction.options.getUser("user", true);
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      }).catch(() => {});
      return interaction.reply({ content: `Added <@${user.id}> to this ticket.`, ephemeral: true }).catch(() => {});
    }

    if (cmd === "ticket-remove") {
      if (!config.FEATURES.TICKETS) return interaction.reply({ content: "Tickets are disabled.", ephemeral: true }).catch(() => {});
      const user = interaction.options.getUser("user", true);
      await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
      return interaction.reply({ content: `Removed <@${user.id}> from this ticket.`, ephemeral: true }).catch(() => {});
    }
  } catch (e) {
    console.error(e);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({ content: `Error: ${String(e.message || e)}`, ephemeral: true });
      } catch {}
    }
  }
});

(async () => {
  await connectMongo();
  await client.login(config.token);

  // Optional: run the member website in the same process (handy for Render).
  // Enable by setting ENABLE_WEB=true (or by providing PORT).
  const enable = String(process.env.ENABLE_WEB || (process.env.PORT ? "true" : "false")).toLowerCase() === "true";
  if (enable) {
    startWebServer().catch((e) => console.error("Web server failed", e));
  }
})();
