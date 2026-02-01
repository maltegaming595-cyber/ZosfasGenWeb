const DiscountCode = require("../models/DiscountCode");
const { logToChannel } = require("../logger");

function splitCodes(input) {
  return input
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  async handle(interaction, client) {
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "Admin only.", ephemeral: true });
    }

    const amount = interaction.options.getInteger("amount", true);
    const raw = interaction.options.getString("codes", true);
    const codes = splitCodes(raw);

    if (!codes.length) {
      return interaction.reply({ content: "No codes found in input.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    let inserted = 0;
    let dupes = 0;

    for (const code of codes) {
      try {
        await DiscountCode.create({ code, amount, used: false });
        inserted++;
      } catch {
        dupes++;
      }
    }

    const remaining = await DiscountCode.countDocuments({ amount, used: false });
    await interaction.editReply(
      `✅ Stocked **${inserted}** codes (${amount}%).` +
        (dupes ? ` Skipped **${dupes}** duplicates.` : "") +
        `\nRemaining ${amount}% codes: **${remaining}**`
    );

    await logToChannel(client, `🏷️ code-stock: +${inserted} (${amount}%) by <@${interaction.user.id}>`);
  },
};
