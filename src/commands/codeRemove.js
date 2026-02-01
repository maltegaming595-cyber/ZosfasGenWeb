const DiscountCode = require("../models/DiscountCode");
const { logToChannel } = require("../logger");

module.exports = {
  async handle(interaction, client) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "Admin only.", ephemeral: true });
    }

    const code = interaction.options.getString("code", true).trim();
    await interaction.deferReply({ ephemeral: true });

    const res = await DiscountCode.deleteOne({ code });
    if (!res.deletedCount) return interaction.editReply("❌ Code not found.");

    await interaction.editReply("✅ Code removed.");
    await logToChannel(client, `🗑️ code-remove: ${code} by <@${interaction.user.id}>`);
  },
};
