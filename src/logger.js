const { CHANNELS } = require("./config");

async function logToChannel(client, message) {
  try {
    if (!CHANNELS.LOG) return;
    const ch = await client.channels.fetch(CHANNELS.LOG).catch(() => null);
    if (ch) await ch.send(message);
  } catch {
    // ignore
  }
}

module.exports = { logToChannel };
