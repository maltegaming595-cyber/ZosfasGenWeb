const fs = require("fs");
const path = require("path");
require("dotenv").config();

function parseSettingsTxt() {
  try {
    const p = path.join(process.cwd(), "settings.txt");
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq === -1) continue;
      const k = s.slice(0, eq).trim();
      const v = s.slice(eq + 1).trim();
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const S = parseSettingsTxt();
const get = (k, fallback = "") => (S[k] ?? process.env[k] ?? fallback);

const toBool = (v, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return def;
};

const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

module.exports = {
  token: get("DISCORD_TOKEN"),
  clientId: get("CLIENT_ID"),
  guildId: get("GUILD_ID"),
  mongoUri: get("MONGODB_URI"),
  searchApiBase: get("SEARCH_API_BASE", ""),

  FEATURES: {
    TICKETS: toBool(get("FEATURE_TICKETS", "true"), true),
    CODES: toBool(get("FEATURE_CODES", "true"), true),
    GIVEAWAYS: toBool(get("FEATURE_GIVEAWAYS", "true"), true),
    RATE_LIMIT: toBool(get("FEATURE_RATE_LIMIT", "true"), true),
  },

  CHANNELS: {
    GENERATE_ONLY: get("CHANNEL_GENERATE_ONLY"),
    OUTPUT: get("CHANNEL_OUTPUT"),
    UPDATE_REQUESTS: get("CHANNEL_UPDATE_REQUESTS"),
    LOG: get("CHANNEL_LOG"),
  },

  ROLES: {
    PREMIUM: get("ROLE_PREMIUM"),
    BOOSTER: get("ROLE_BOOSTER"),
    SUPPORT: get("ROLE_SUPPORT"),
  },

  TICKETS: {
    CATEGORY: get("TICKETS_CATEGORY", ""),
    DELETE_AFTER_MS: toInt(get("TICKETS_DELETE_AFTER_MS", "86400000"), 24 * 60 * 60 * 1000),
  },

  GITHUB: {
    REPO: get("GITHUB_REPO", "maltegaming595-cyber/ZosfasGenLocal"),
    MANIFEST_URL: get(
      "GITHUB_MANIFEST_URL",
      "https://raw.githubusercontent.com/maltegaming595-cyber/ZosfasGenLocal/main/manifest.json"
    ),
    FALLBACK_TAG: get("GITHUB_FALLBACK_TAG", "files-000"),
  },

  LINKS: {
    DLC: get("LINK_DLC", ""),
    ONLINE: get("LINK_ONLINE", ""),
    STORE: get("LINK_STORE", ""),
    PREMIUM_INFO: get("LINK_PREMIUM", ""),
  },

  OPTIONAL: {
    allowedGuildId: get("ALLOWED_GUILD_ID", "") || null,
  },

  LIMITS: {
    FREE_DAILY_GENERATIONS: toInt(get("FREE_DAILY_GENERATIONS", "5"), 5),
  },
};
