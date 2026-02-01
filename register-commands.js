require("dotenv").config();
const { REST, Routes } = require("discord.js");
const config = require("./src/config");

const token = config.token;
const clientId = config.clientId;
const guildId = config.guildId;

if (!token || !clientId || !guildId) {
  console.error("Missing DISCORD_TOKEN / CLIENT_ID / GUILD_ID (settings.txt or .env)");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

const commands = [
  // MEMBER
  {
    name: "generate",
    description: "Generate and send the files in the game channel",
    type: 1,
    options: [
      { name: "query", description: "Steam AppID or game name", type: 3, required: true, autocomplete: true },
    ],
  },
  {
    name: "gen",
    description: "Generate and send the files in the game channel",
    type: 1,
    options: [
      { name: "query", description: "Steam AppID or game name", type: 3, required: true, autocomplete: true },
    ],
  },
  {
    name: "request",
    description: "Generate and send the files in the game channel",
    type: 1,
    options: [
      { name: "query", description: "Steam AppID or game name", type: 3, required: true, autocomplete: true },
    ],
  },
  {
    name: "update",
    description: "Notifies our game adders that a game needs to be updated",
    type: 1,
    options: [
      { name: "query", description: "Steam AppID or game name", type: 3, required: true, autocomplete: true },
    ],
  },
  { name: "availability", description: "Check if a zip exists (and show size)", type: 1,
    options: [{ name: "query", description: "Steam AppID or game name", type: 3, required: true, autocomplete: true }],
  },
  {
    name: "report",
    description: "Report a broken/missing game zip",
    type: 1,
    options: [
      { name: "query", description: "Steam AppID or game name", type: 3, required: true, autocomplete: true },
      { name: "reason", description: "What’s wrong?", type: 3, required: true },
    ],
  },

  { name: "dlc", description: "Sends a link to creaminstaller, the dlc tool.", type: 1 },
  { name: "online", description: "Sends a link to online-fix, the online tool.", type: 1 },
  { name: "store", description: "Get taken to our online store!", type: 1 },
  { name: "premium", description: "Check ur premium stats!", type: 1 },
  { name: "boost", description: "Check ur boost stats!", type: 1 },

  // ADMIN
  {
    name: "premium-activate",
    description: "Give a user premium (ADMIN)",
    type: 1,
    options: [
      { name: "user", description: "User", type: 6, required: true },
      { name: "duration", description: "e.g. 7d, 30d, 12h", type: 3, required: true },
    ],
  },
  { name: "premium-list", description: "Lists all premium users (ADMIN)", type: 1 },
  {
    name: "bot-ban",
    description: "Bans a user from using any bot commands (ADMIN)",
    type: 1,
    options: [
      { name: "user", description: "User", type: 6, required: true },
      { name: "duration", description: "e.g. 1d, 12h", type: 3, required: true },
      { name: "reason", description: "Reason (optional)", type: 3, required: false },
    ],
  },

  // CODES (ADMIN)
  {
    name: "code-stock",
    description: "Stocks up the code pool (ADMIN)",
    type: 1,
    options: [
      {
        name: "amount",
        description: "25/50/75/100",
        type: 4,
        required: true,
        choices: [
          { name: "25%", value: 25 },
          { name: "50%", value: 50 },
          { name: "75%", value: 75 },
          { name: "100%", value: 100 },
        ],
      },
      { name: "codes", description: "Codes separated by commas/spaces/newlines", type: 3, required: true },
    ],
  },
  {
    name: "code-remove",
    description: "Remove a specific code (ADMIN)",
    type: 1,
    options: [{ name: "code", description: "Code", type: 3, required: true }],
  },
  { name: "game-code", description: "Allows admins to print out a code (ADMIN)", type: 1 },

  // Tickets
  { name: "ticket-embed", description: "Creates the ticket embed in a channel (ADMIN).", type: 1 },
  { name: "ticket-open", description: "Opens a ticket after it being closed.", type: 1 },
  { name: "ticket-close", description: "Closes a open ticket.", type: 1 },
  { name: "ticket-delete", description: "Deletes a ticket.", type: 1 },

  // Giveaways (ADMIN + management)
  {
    name: "giveaway",
    description: "Giveaway commands",
    type: 1,
    options: [
      { name: "setup", description: "Admin: open giveaway setup panel", type: 1 },
      { name: "start", description: "Admin: start giveaway from saved settings", type: 1 },
      {
        name: "end",
        description: "Admin: force end early",
        type: 1,
        options: [{ name: "messageid", description: "Giveaway message ID", type: 3, required: true }],
      },
      {
        name: "reroll",
        description: "Admin: reroll winners",
        type: 1,
        options: [{ name: "messageid", description: "Giveaway message ID", type: 3, required: true }],
      },
    ],
  },

  // Debug
  {
    name: "debugzip",
    description: "Admin: debug zip lookup for an AppID",
    type: 1,
    options: [{ name: "appid", description: "Steam AppID", type: 3, required: true }],
  },
];

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Registered guild commands.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
