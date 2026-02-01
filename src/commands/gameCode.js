const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const DiscountCode = require("../models/DiscountCode");
const { logToChannel } = require("../logger");

async function counts() {
  const [a25, a50, a75, a100] = await Promise.all([
    DiscountCode.countDocuments({ amount: 25, used: false }),
    DiscountCode.countDocuments({ amount: 50, used: false }),
    DiscountCode.countDocuments({ amount: 75, used: false }),
    DiscountCode.countDocuments({ amount: 100, used: false }),
  ]);
  return { 25: a25, 50: a50, 75: a75, 100: a100 };
}

function panelEmbed(c) {
  return new EmbedBuilder()
    .setTitle("Dispense a discount code")
    .setDescription("Choose a percentage below. Stock shown on buttons.")
    .setColor(0x5865f2)
    .addFields(
      { name: "25%", value: String(c[25]), inline: true },
      { name: "50%", value: String(c[50]), inline: true },
      { name: "75%", value: String(c[75]), inline: true },
      { name: "100%", value: String(c[100]), inline: true }
    );
}

function panelButtons(c) {
  const mk = (amt) =>
    new ButtonBuilder()
      .setCustomId(`code:${amt}`)
      .setLabel(`${amt}% (${c[amt]})`)
      .setStyle(amt === 100 ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setDisabled(c[amt] <= 0);

  return [new ActionRowBuilder().addComponents(mk(25), mk(50), mk(75), mk(100))];
}

module.exports = {
  async handle(interaction) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "Admin only.", ephemeral: true });
    }

    const c = await counts();
    return interaction.reply({ ephemeral: true, embeds: [panelEmbed(c)], components: panelButtons(c) });
  },

  async dispense(interaction, client, amount) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "Admin only.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const doc = await DiscountCode.findOneAndUpdate(
      { amount, used: false },
      { $set: { used: true, usedAt: new Date(), usedBy: interaction.user.id } },
      { new: true }
    );

    if (!doc) return interaction.editReply(`❌ No ${amount}% codes left.`);

    const c = await counts();

    // best-effort update of the original panel message
    try {
      await interaction.message.edit({ embeds: [panelEmbed(c)], components: panelButtons(c) });
    } catch {}

    await interaction.editReply(`✅ Your **${amount}%** code:\n\`${doc.code}\``);
    await logToChannel(client, `🎟️ game-code: dispensed ${amount}% by <@${interaction.user.id}>`);
  },
};
