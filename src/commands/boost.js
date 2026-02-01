const { ROLES } = require("../config");

module.exports = {
  async handle(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return interaction.reply({ content: "Could not read your roles.", ephemeral: true });

    if (member.roles.cache.has(ROLES.BOOSTER)) {
      return interaction.reply({ content: "Thanks for boosting! 💜", ephemeral: true });
    }
    return interaction.reply({ content: "Boost the server to unlock booster perks.", ephemeral: true });
  }
};
