const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { attachHandlers } = require("./discordHandlers");

let client = null;

async function initDiscordClient(token) {
  if (!token) throw new Error("DISCORD_TOKEN missing");
  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });

  attachHandlers(client);

  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    client.login(token).catch(reject);
  });

  console.log(`✅ Discord logged in as ${client.user.tag}`);
  return client;
}

function getDiscord() {
  if (!client) throw new Error("Discord client not initialized");
  return client;
}

module.exports = { initDiscordClient, getDiscord };
