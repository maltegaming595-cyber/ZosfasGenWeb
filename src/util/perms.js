const { PermissionsBitField } = require("discord.js");

function isAdmin(member) {
  return member && member.permissions.has(PermissionsBitField.Flags.Administrator);
}

module.exports = { isAdmin };
