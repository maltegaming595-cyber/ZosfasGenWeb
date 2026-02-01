const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  async handle(interaction) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "Admin only.", ephemeral: true });
    }

    if (!config.FEATURES?.TICKETS) {
      return interaction.reply({ content: "Tickets are currently disabled.", ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle("Support Tickets")
      .setDescription(
        "Choose a topic, then click **Open Ticket**.\n\n" +
          "Topics:\n" +
          "• **Game** — help with a game / request\n" +
          "• **Premium** — premium questions\n" +
          "• **Glitches** — bot/site problems\n" +
          "• **Other** — you’ll type your own topic"
      )
      .setColor(0x5865f2);

    const topicMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket-topic")
      .setPlaceholder("Select a topic…")
      .addOptions(
        { label: "Game", value: "game", description: "Game help / request" },
        { label: "Premium", value: "premium", description: "Premium support" },
        { label: "Glitches", value: "glitches", description: "Report glitches" },
        { label: "Other", value: "other", description: "Type your own topic" }
      );

    const row1 = new ActionRowBuilder().addComponents(topicMenu);

    const openBtn = new ButtonBuilder()
      .setCustomId("ticket-open-btn")
      .setStyle(ButtonStyle.Primary)
      .setLabel("Open Ticket");

    const row2 = new ActionRowBuilder().addComponents(openBtn);

    await interaction.reply({ embeds: [embed], components: [row1, row2] });
  },
};
