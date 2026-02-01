const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");

const Ticket = require("./models/Ticket");

const pendingDeleteByChannel = new Map(); // channelId -> timeout

function isSupport(member) {
  const supportRole = process.env.ROLE_SUPPORT;
  return !!(supportRole && member?.roles?.cache?.has(supportRole));
}

async function lockChannel(channel, openerId) {
  await channel.permissionOverwrites.edit(openerId, { SendMessages: false }).catch(() => null);
}

async function unlockChannel(channel, openerId) {
  await channel.permissionOverwrites.edit(openerId, { SendMessages: true }).catch(() => null);
}

async function scheduleAutoDelete(channelId, ms) {
  const deleteAt = new Date(Date.now() + ms);
  await Ticket.updateOne({ channelId }, { $set: { deleteAt } }).catch(() => null);
}

async function startDeleteCountdown(channel) {
  if (pendingDeleteByChannel.has(channel.id)) return;

  const cancelBtn = new ButtonBuilder()
    .setCustomId("ticket-delete-cancel")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(cancelBtn);

  const msg = await channel
    .send({ content: "🗑️ Ticket will be deleted in **5 seconds**…", components: [row] })
    .catch(() => null);

  const timeout = setTimeout(async () => {
    pendingDeleteByChannel.delete(channel.id);
    try {
      await channel.delete("Ticket deleted");
    } catch {}
  }, 5000);

  pendingDeleteByChannel.set(channel.id, { timeout, msgId: msg?.id || null });
}

function attachHandlers(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isButton()) return;

      const { customId } = interaction;
      if (
        !["ticket-close-btn", "ticket-open-btn", "ticket-delete-btn", "ticket-delete-cancel"].includes(customId)
      )
        return;

      const channel = interaction.channel;
      if (!channel || !("permissionOverwrites" in channel)) return;

      const ticket = await Ticket.findOne({ channelId: channel.id }).lean().catch(() => null);
      if (!ticket) return interaction.reply({ content: "Ticket not found.", ephemeral: true });

      const member = interaction.member;
      const support = isSupport(member);

      // Only opener or support can operate
      if (!support && interaction.user.id !== ticket.userId) {
        return interaction.reply({ content: "No permission.", ephemeral: true });
      }

      if (customId === "ticket-close-btn") {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        await lockChannel(channel, ticket.userId);
        await Ticket.updateOne({ channelId: channel.id }, { $set: { status: "closed" } });

        // rename channel
        const base = channel.name.replace(/^⭐?ticket-/, "").replace(/^closed-/, "");
        await channel.setName(`closed-${base}`).catch(() => null);

        const delBtn = new ButtonBuilder()
          .setCustomId("ticket-delete-btn")
          .setLabel("Delete Ticket")
          .setStyle(ButtonStyle.Danger);

        const openBtn = new ButtonBuilder()
          .setCustomId("ticket-open-btn")
          .setLabel("Reopen")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(openBtn, delBtn);

        const embed = new EmbedBuilder()
          .setTitle("Ticket closed")
          .setDescription(
            "This ticket is now closed.\n\n• Support can still talk.\n• You can delete it now, or it will auto-delete in 24h."
          );

        await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
        await scheduleAutoDelete(channel.id, parseInt(process.env.TICKETS_DELETE_AFTER_MS || "86400000", 10));

        return interaction.editReply({ content: "Closed ✅" }).catch(() => null);
      }

      if (customId === "ticket-open-btn") {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);

        await unlockChannel(channel, ticket.userId);
        await Ticket.updateOne({ channelId: channel.id }, { $set: { status: "open" } });

        // rename back
        const base = channel.name.replace(/^closed-/, "");
        const prefix = channel.name.startsWith("⭐") ? "⭐ticket-" : "ticket-";
        await channel.setName(`${prefix}${base}`).catch(() => null);

        const embed = new EmbedBuilder().setTitle("Ticket reopened").setDescription("You can chat again.");
        await channel.send({ embeds: [embed] }).catch(() => null);

        return interaction.editReply({ content: "Reopened ✅" }).catch(() => null);
      }

      if (customId === "ticket-delete-btn") {
        await interaction.reply({ content: "Starting delete countdown…", ephemeral: true }).catch(() => null);
        await startDeleteCountdown(channel);
        return;
      }

      if (customId === "ticket-delete-cancel") {
        const pending = pendingDeleteByChannel.get(channel.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingDeleteByChannel.delete(channel.id);
          if (pending.msgId) {
            channel.messages.fetch(pending.msgId).then((m) => m.delete().catch(() => null)).catch(() => null);
          }
        }
        return interaction.reply({ content: "Deletion cancelled ✅", ephemeral: true }).catch(() => null);
      }
    } catch (e) {
      console.error("interaction handler error", e);
    }
  });
}

module.exports = { attachHandlers };
