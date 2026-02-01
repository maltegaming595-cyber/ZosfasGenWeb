const { AttachmentBuilder } = require("discord.js");

async function fetchAllMessages(channel, limitTotal = 500) {
  let lastId = null;
  const all = [];

  while (all.length < limitTotal) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId || undefined });
    if (!batch.size) break;
    const msgs = [...batch.values()];
    all.push(...msgs);
    lastId = msgs[msgs.length - 1].id;
  }

  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function renderTranscriptText(messages) {
  return messages.map(m => {
    const t = new Date(m.createdTimestamp).toISOString();
    const author = `${m.author.tag}`;
    const content = m.content || "";
    const attachments = m.attachments.size
      ? ` [attachments: ${[...m.attachments.values()].map(a => a.url).join(", ")}]`
      : "";
    return `[${t}] ${author}: ${content}${attachments}`;
  }).join("\n");
}

async function buildTranscriptAttachment(channel) {
  const messages = await fetchAllMessages(channel, 800);
  const txt = renderTranscriptText(messages);
  const buf = Buffer.from(txt || "(no messages)", "utf8");
  return new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` });
}

module.exports = { buildTranscriptAttachment };
