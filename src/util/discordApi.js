// Minimal Discord REST helpers for the website (role checks).
// Uses global fetch (Node 18+).

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

async function fetchDiscordUser(accessToken) {
  const { ok, json } = await fetchJson("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return ok ? json : null;
}

async function fetchGuildMemberRoles({ botToken, guildId, userId }) {
  if (!botToken || !guildId || !userId) return [];
  const { ok, status, json } = await fetchJson(
    `https://discord.com/api/guilds/${guildId}/members/${userId}`,
    {
      headers: { Authorization: `Bot ${botToken}` },
    }
  );

  // 404 means user isn't in the guild
  if (!ok) {
    if (status === 404) return [];
    console.error("fetchGuildMemberRoles failed", status, json);
    return [];
  }

  return Array.isArray(json?.roles) ? json.roles : [];
}

module.exports = { fetchDiscordUser, fetchGuildMemberRoles };
