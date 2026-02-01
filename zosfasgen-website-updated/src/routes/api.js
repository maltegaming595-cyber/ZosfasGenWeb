const express = require("express");
const { z } = require("zod");
const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { requireLogin } = require("../middleware/auth");
const { getDiscord } = require("../discord");

const Premium = require("../models/Premium");
const BotBan = require("../models/BotBan");
const CodeStock = require("../models/CodeStock");
const TicketCounter = require("../models/TicketCounter");
const Ticket = require("../models/Ticket");
const Giveaway = require("../models/Giveaway");

const { githubZipInfo } = require("../util/github");
const { isNumeric, searchGamesByName } = require("../util/gameSearch");
const { GITHUB } = require("../webConfig");

const router = express.Router();

const GUILD_ID = process.env.GUILD_ID;
const ROLE_PREMIUM = process.env.ROLE_PREMIUM;
const ROLE_BOOSTER = process.env.ROLE_BOOSTER;
const ROLE_SUPPORT = process.env.ROLE_SUPPORT;

const CHANNEL_OUTPUT = process.env.CHANNEL_OUTPUT;
const CHANNEL_UPDATE_REQUESTS = process.env.CHANNEL_UPDATE_REQUESTS;
const TICKETS_CATEGORY = process.env.TICKETS_CATEGORY;

function msFromDuration(input) {
  // supports: 30m, 12h, 7d, 4w, 3mo
  const m = String(input || "").trim().match(/^(\d+)\s*(m|h|d|w|mo)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = { m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3, mo: 30 * 86400e3 }[unit];
  return n * mult;
}


async function finalizeGiveaway({ channelId, messageId, endedByUserId = null, auto = false }) {
  const doc = await Giveaway.findOne({ messageId }).lean();
  if (!doc) return { ok: false, error: "not_found" };
  if (doc.ended) return { ok: true, alreadyEnded: true, winners: [] };

  const client = getDiscord();
  const channel = await client.channels.fetch(channelId);
  const msg = await channel.messages.fetch(messageId);

  // Collect entries
  const reaction = msg.reactions.cache.get("🎉");
  const users = reaction ? await reaction.users.fetch() : null;
  const entries = users ? users.filter((u) => !u.bot).map((u) => u.id) : [];

  // Pick winners
  const winners = [];
  const pool = [...entries];
  while (winners.length < doc.winners && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(i, 1)[0]);
  }

  await Giveaway.updateOne({ messageId }, { $set: { ended: true, endsAt: new Date() } }).catch(() => null);

  // Update original message embed
  const old = msg.embeds?.[0];
  const embed = EmbedBuilder.from(old || new EmbedBuilder().setTitle(`🎉 ${doc.title}`));
  embed.setDescription(
    `**Ended** ✅\nWinners: **${doc.winners}**\n\n${
      winners.length ? `Winners: ${winners.map((id) => `<@${id}>`).join(", ")}` : "No valid entries."
    }`
  );
  await msg.edit({ embeds: [embed] }).catch(() => null);

  const who = endedByUserId ? `<@${endedByUserId}>` : (auto ? "⏱ Auto" : "System");
  await channel.send(`🏁 Giveaway ended (${who}). ${winners.length ? `Winners: ${winners.map((id) => `<@${id}>`).join(", ")}` : "No valid entries."}`);

  return { ok: true, winners };
}

async function fetchGuildMember(userId) {
  const client = getDiscord();
  const guild = await client.guilds.fetch(GUILD_ID);
  return guild.members.fetch(userId);
}

function memberIsAdmin(member) {
  // Accept: Administrator OR ManageGuild
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

async function assertNotBanned(userId) {
  const ban = await BotBan.findOne({ userId }).lean();
  if (ban?.expiresAt && ban.expiresAt > new Date()) return { banned: true, ban };
  return { banned: false };
}

async function isPremium(member, userId) {
  if (ROLE_PREMIUM && member.roles.cache.has(ROLE_PREMIUM)) return true;
  const doc = await Premium.findOne({ userId }).lean();
  return !!(doc?.expiresAt && doc.expiresAt > new Date());
}

router.get("/me", (req, res) => {
  if (!req.user) return res.json({ ok: true, loggedIn: false });
  res.json({
    ok: true,
    loggedIn: true,
    user: { id: req.user.id, username: req.user.username, discriminator: req.user.discriminator, avatar: req.user.avatar },
  });
});

router.get("/links", (req, res) => {
  res.json({
    ok: true,
    links: {
      dlc: process.env.LINK_DLC || "",
      online: process.env.LINK_ONLINE || "",
      store: process.env.LINK_STORE || "",
      premiumInfo: process.env.LINK_PREMIUM_INFO || "",
    },
  });

router.get("/admin/check", requireLogin, async (req, res) => {
  try {
    const member = await fetchGuildMember(req.user.id);
    res.json({ ok: true, admin: memberIsAdmin(member) });
  } catch {
    res.json({ ok: true, admin: false });
  }
});

router.get("/guild/channels", requireLogin, async (req, res) => {
  // For dropdowns in the UI
  try {
    const member = await fetchGuildMember(req.user.id).catch(() => null);
    if (!member) return res.status(403).json({ ok: false, error: "not_in_guild" });

    const client = getDiscord();
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();

    const mapped = [];
    for (const [, ch] of channels) {
      if (!ch) continue;
      // Only include text-based channels the bot can post in
      const isText = !!ch.isTextBased?.();
      if (!isText) continue;
      if (ch.isThread?.()) continue;
      mapped.push({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        parentId: ch.parentId || null,
        parentName: ch.parent?.name || null,
      });
    }
    // Sort by category then name
    mapped.sort((a, b) => {
      const ap = (a.parentName || "").toLowerCase();
      const bp = (b.parentName || "").toLowerCase();
      if (ap !== bp) return ap.localeCompare(bp);
      return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
    });

    res.json({ ok: true, channels: mapped });
  } catch (e) {
    res.status(500).json({ ok: false, error: "failed_to_fetch_channels" });
  }
});

router.get("/tickets/list", requireLogin, async (req, res) => {
  const scope = String(req.query.scope || "mine");
  const member = await fetchGuildMember(req.user.id).catch(() => null);
  if (!member) return res.status(403).json({ ok: false, error: "not_in_guild" });

  const admin = memberIsAdmin(member);
  const query = scope === "all" && admin ? { guildId: GUILD_ID } : { guildId: GUILD_ID, userId: req.user.id };
  const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(200).lean();

  res.json({
    ok: true,
    admin,
    tickets: tickets.map((t) => ({
      id: t._id,
      channelId: t.channelId,
      topic: t.topic,
      status: t.status,
      deleteAt: t.deleteAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      url: `https://discord.com/channels/${GUILD_ID}/${t.channelId}`,
    })),
  });
});

});

router.get("/stats", async (req, res) => {
  // cosmetic: online count from guild
  try {
    const client = getDiscord();
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch({ withPresences: false }).catch(() => null);
    res.json({ ok: true, members: guild.memberCount });
  } catch (e) {
    res.json({ ok: true, members: null });
  }
});

/** GENERATOR **/
router.post("/generate", requireLogin, async (req, res) => {
  const schema = z.object({ query: z.string().min(1).max(200) });
  const { query } = schema.parse(req.body);

  const { banned, ban } = await assertNotBanned(req.user.id);
  if (banned) return res.status(403).json({ ok: false, error: "banned", ban });

  const client = getDiscord();
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(req.user.id).catch(() => null);
  if (!member) return res.status(403).json({ ok: false, error: "not_in_guild" });

  // Resolve appid if user typed a name
  let appid = String(query).trim();
  let displayName = appid;
  if (!isNumeric(appid)) {
    const matches = await searchGamesByName(appid);
    if (matches.length === 0) return res.status(404).json({ ok: false, error: "no_matches" });
    if (matches.length > 1) return res.status(409).json({ ok: false, error: "multiple_matches", matches });
    appid = String(matches[0].appid);
    displayName = matches[0].name;
  }

  // Pull GitHub zip info (same logic as bot)
  const info = await githubZipInfo(GITHUB.REPO, GITHUB.MANIFEST_URL, GITHUB.FALLBACK_TAG, appid);
  if (!info.ok) return res.status(404).json({ ok: false, error: "not_found_on_github", info });

  const embed = new EmbedBuilder()
    .setTitle(displayName)
    .setDescription("Click the button below to download.")
    .addFields({ name: "Steam ID", value: String(appid), inline: true });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Download").setStyle(ButtonStyle.Link).setURL(info.url)
  );

  const out = await client.channels.fetch(CHANNEL_OUTPUT);
  const msg = await out.send({ embeds: [embed], components: [row] });

  res.json({ ok: true, messageId: msg.id, channelId: out.id, appid, url: info.url, size: info.size });
});

/** UPDATE **/
router.post("/update", requireLogin, async (req, res) => {
  const schema = z.object({ query: z.string().min(1).max(200) });
  const { query } = schema.parse(req.body);

  const { banned, ban } = await assertNotBanned(req.user.id);
  if (banned) return res.status(403).json({ ok: false, error: "banned", ban });

  const client = getDiscord();
  const ch = await client.channels.fetch(CHANNEL_UPDATE_REQUESTS || CHANNEL_OUTPUT);
  const msg = await ch.send(`📌 Update request from <@${req.user.id}>: \`${query}\``);

  res.json({ ok: true, messageId: msg.id, channelId: ch.id });
});

/** PREMIUM / BOOST **/
router.get("/premium", requireLogin, async (req, res) => {
  const member = await fetchGuildMember(req.user.id).catch(() => null);
  if (!member) return res.status(403).json({ ok: false, error: "not_in_guild" });

  const doc = await Premium.findOne({ userId: req.user.id }).lean();
  const hasRole = ROLE_PREMIUM ? member.roles.cache.has(ROLE_PREMIUM) : false;
  const expiresAt = doc?.expiresAt || null;
  res.json({ ok: true, hasRole, expiresAt });
});

router.get("/boost", requireLogin, async (req, res) => {
  const member = await fetchGuildMember(req.user.id).catch(() => null);
  if (!member) return res.status(403).json({ ok: false, error: "not_in_guild" });

  const hasRole = ROLE_BOOSTER ? member.roles.cache.has(ROLE_BOOSTER) : false;
  res.json({
    ok: true,
    boosted: hasRole,
    message: hasRole
      ? "Thanks for boosting! 💙"
      : "You are not boosting right now. See the Boost info in Discord.",
  });
});

/** TICKETS **/
router.post("/tickets", requireLogin, async (req, res) => {
  const schema = z.object({
    topic: z.enum(["game", "premium", "glitches", "other"]),
    otherText: z.string().max(100).optional().default(""),
  });
  const { topic, otherText } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id).catch(() => null);
  if (!member) return res.status(403).json({ ok: false, error: "not_in_guild" });

  const premiumFlag = await isPremium(member, req.user.id);
  const counter = await TicketCounter.findOneAndUpdate(
    { key: "global" },
    { $inc: { value: 1 }, $setOnInsert: { key: "global", value: 0 } },
    { upsert: true, new: true }
  );

  const num = String(counter.value).padStart(4, "0");
  const name = premiumFlag ? `⭐ticket-${num}` : `ticket-${num}`;

  const client = getDiscord();
  const guild = await client.guilds.fetch(GUILD_ID);
  const category = await guild.channels.fetch(TICKETS_CATEGORY);

  const channel = await guild.channels.create({
    name,
    parent: category?.id || null,
    reason: "Website ticket create",
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ["ViewChannel"] },
      { id: req.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      { id: ROLE_SUPPORT, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
    ],
  });

  const cleanTopic = topic === "other" ? `Other: ${otherText || "—"}` : topic;
  await Ticket.create({
    channelId: channel.id,
    guildId: guild.id,
    userId: req.user.id,
    topic: cleanTopic,
    status: "open",
  });

  const closeBtn = new ButtonBuilder().setCustomId("ticket-close-btn").setLabel("Close Ticket").setStyle(ButtonStyle.Primary);
  const embed = new EmbedBuilder()
    .setTitle("Ticket opened")
    .setDescription(`Topic: **${cleanTopic}**\n\nUse the button below to close this ticket when you're done.`);

  await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });

  res.json({ ok: true, channelId: channel.id, name });
});

/** GIVEAWAYS **/
router.post("/giveaways/create", requireLogin, async (req, res) => {
  const schema = z.object({
    channelId: z.string().min(1),
    title: z.string().min(1).max(80),
    duration: z.string().min(2).max(20), // e.g. 2h
    winners: z.number().int().min(1).max(20),
  });
  const { channelId, title, duration, winners } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const ms = msFromDuration(duration);
  if (!ms) return res.status(400).json({ ok: false, error: "bad_duration" });

  const endsAt = new Date(Date.now() + ms);

  const client = getDiscord();
  const channel = await client.channels.fetch(channelId);
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${title}`)
    .setDescription(`Ends: <t:${Math.floor(endsAt.getTime() / 1000)}:R>\nWinners: **${winners}**\n\nReact with 🎉 to enter!`);

  const msg = await channel.send({ embeds: [embed] });
  await msg.react("🎉").catch(() => null);

  await Giveaway.create({
    guildId: GUILD_ID,
    channelId,
    messageId: msg.id,
    title,
    winners,
    endsAt,
    createdBy: req.user.id,
  });

  res.json({ ok: true, messageId: msg.id, endsAt });
});

router.post("/giveaways/end", requireLogin, async (req, res) => {
  const schema = z.object({ messageId: z.string().min(1), channelId: z.string().min(1) });
  const { messageId, channelId } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  try {
    const r = await finalizeGiveaway({ channelId, messageId, endedByUserId: req.user.id, auto: false });
    if (!r.ok) return res.status(404).json({ ok: false, error: r.error });
    res.json({ ok: true, winners: r.winners || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: "end_failed" });
  }
});


router.post("/giveaways/reroll", requireLogin, async (req, res) => {
  const schema = z.object({ messageId: z.string().min(1), channelId: z.string().min(1) });
  const { messageId, channelId } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const doc = await Giveaway.findOne({ messageId }).lean();
  if (!doc) return res.status(404).json({ ok: false, error: "not_found" });

  const client = getDiscord();
  const channel = await client.channels.fetch(channelId);
  const msg = await channel.messages.fetch(messageId);

  const reaction = msg.reactions.cache.get("🎉");
  if (!reaction) return res.status(400).json({ ok: false, error: "no_entries" });

  const users = await reaction.users.fetch();
  const entries = users.filter((u) => !u.bot).map((u) => u.id);

  const winners = [];
  while (winners.length < doc.winners && entries.length) {
    const i = Math.floor(Math.random() * entries.length);
    winners.push(entries.splice(i, 1)[0]);
  }

  await channel.send(`🔁 Rerolled winners: ${winners.map((id) => `<@${id}>`).join(", ") || "No valid entries."}`);
  res.json({ ok: true, winners });
});

/** CODES **/
router.get("/codes/stock", requireLogin, async (req, res) => {
  const docs = await CodeStock.find({}).lean();
  const stock = { 25: 0, 50: 0, 75: 0, 100: 0 };
  for (const d of docs) stock[d.amount] = d.codes.length;
  res.json({ ok: true, stock });
});

router.post("/codes/stock", requireLogin, async (req, res) => {
  const schema = z.object({
    amount: z.number().int().refine((n) => [25, 50, 75, 100].includes(n)),
    codes: z.string().min(1),
  });
  const { amount, codes } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const list = codes.split(",").map((s) => s.trim()).filter(Boolean);
  const doc = await CodeStock.findOneAndUpdate(
    { amount },
    { $setOnInsert: { amount, codes: [] } },
    { upsert: true, new: true }
  );
  doc.codes.push(...list);
  await doc.save();

  res.json({ ok: true, added: list.length, left: doc.codes.length });
});

router.post("/codes/get", requireLogin, async (req, res) => {
  const schema = z.object({ amount: z.number().int().refine((n) => [25, 50, 75, 100].includes(n)) });
  const { amount } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const doc = await CodeStock.findOne({ amount });
  if (!doc || doc.codes.length === 0) return res.status(400).json({ ok: false, error: "out_of_stock" });

  const code = doc.codes.shift();
  await doc.save();

  res.json({ ok: true, code, left: doc.codes.length });
});

/** ADMIN: premium activate, list, bot-ban **/
router.post("/admin/premium-activate", requireLogin, async (req, res) => {
  const schema = z.object({
    userId: z.string().min(1),
    duration: z.string().min(2).max(20), // e.g. 7d
  });
  const { userId, duration } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const ms = msFromDuration(duration);
  if (!ms) return res.status(400).json({ ok: false, error: "bad_duration" });

  const expiresAt = new Date(Date.now() + ms);
  await Premium.findOneAndUpdate(
    { userId },
    { $set: { userId, expiresAt, grantedBy: req.user.id } },
    { upsert: true }
  );

  // also grant role if possible
  if (ROLE_PREMIUM) {
    const target = await fetchGuildMember(userId).catch(() => null);
    await target?.roles?.add(ROLE_PREMIUM).catch(() => null);
  }

  res.json({ ok: true, expiresAt });
});

router.get("/admin/premium-list", requireLogin, async (req, res) => {
  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const list = await Premium.find({ expiresAt: { $gt: new Date(0) } }).lean();
  res.json({ ok: true, list });
});

router.post("/admin/bot-ban", requireLogin, async (req, res) => {
  const schema = z.object({
    userId: z.string().min(1),
    duration: z.string().min(2).max(20),
    reason: z.string().max(140).optional().default(""),
  });
  const { userId, duration, reason } = schema.parse(req.body);

  const member = await fetchGuildMember(req.user.id);
  if (!memberIsAdmin(member)) return res.status(403).json({ ok: false, error: "admin_only" });

  const ms = msFromDuration(duration);
  if (!ms) return res.status(400).json({ ok: false, error: "bad_duration" });

  const expiresAt = new Date(Date.now() + ms);
  await BotBan.findOneAndUpdate(
    { userId },
    { $set: { userId, expiresAt, reason, bannedBy: req.user.id } },
    { upsert: true }
  );

  res.json({ ok: true, expiresAt });
});

module.exports = router;
