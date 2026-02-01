const Giveaway = require("../models/Giveaway");
const { EmbedBuilder } = require("discord.js");
const { getDiscord } = require("../discord");

async function finalizeGiveawayAuto(doc) {
  const client = getDiscord();
  const channel = await client.channels.fetch(doc.channelId);
  const msg = await channel.messages.fetch(doc.messageId);

  const reaction = msg.reactions.cache.get("🎉");
  const users = reaction ? await reaction.users.fetch() : null;
  const entries = users ? users.filter((u) => !u.bot).map((u) => u.id) : [];

  const winners = [];
  const pool = [...entries];
  while (winners.length < doc.winners && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(i, 1)[0]);
  }

  await Giveaway.updateOne({ messageId: doc.messageId }, { $set: { ended: true, endsAt: new Date() } }).catch(() => null);

  const old = msg.embeds?.[0];
  const embed = EmbedBuilder.from(old || new EmbedBuilder().setTitle(`🎉 ${doc.title}`));
  embed.setDescription(
    `**Ended** ✅\nWinners: **${doc.winners}**\n\n${
      winners.length ? `Winners: ${winners.map((id) => `<@${id}>`).join(", ")}` : "No valid entries."
    }`
  );
  await msg.edit({ embeds: [embed] }).catch(() => null);

  await channel.send(`🏁 Giveaway ended (⏱ Auto). ${winners.length ? `Winners: ${winners.map((id) => `<@${id}>`).join(", ")}` : "No valid entries."}`);

  return winners;
}

function startGiveawayScheduler({ intervalMs = 20000 } = {}) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const due = await Giveaway.find({ ended: false, endsAt: { $lte: now } }).limit(10).lean();
      for (const doc of due) {
        try {
          // re-check quickly in case another worker ended it
          const fresh = await Giveaway.findOne({ messageId: doc.messageId }).lean();
          if (!fresh || fresh.ended) continue;
          await finalizeGiveawayAuto(fresh);
        } catch {
          // if ending fails, try again next tick
        }
      }
    } finally {
      running = false;
    }
  }, intervalMs);

  console.log(`⏱ Giveaway scheduler enabled (every ${Math.round(intervalMs / 1000)}s).`);
}

module.exports = { startGiveawayScheduler };
