const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

const config = require("../config");
const { githubZipInfo } = require("../util/github");
const { enforceDailyLimit, getDailyUsage } = require("../util/downloadLimit");
const { fetchDiscordUser, fetchGuildMemberRoles } = require("../util/discordApi");

function mustEnv(name, fallback = "") {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// Lightweight signed session cookie (no extra deps)
function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(token, secret) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const exp = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  // timing safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(exp);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function ghCfg() {
  return {
    repo: config.GITHUB.REPO,
    manifestUrl: config.GITHUB.MANIFEST_URL,
    fallbackTag: config.GITHUB.FALLBACK_TAG,
  };
}

async function resolveRoles(discordId) {
  const roles = await fetchGuildMemberRoles({
    botToken: config.token,
    guildId: config.guildId,
    userId: discordId,
  });
  const isPremium = roles.includes(config.ROLES.PREMIUM);
  const isAdmin = roles.includes(process.env.WEBSITE_ADMIN_ROLE_ID || "1467344940383338662");
  return { roles, isPremium, isAdmin };
}

function requireAuth(jwtSecret) {
  return async (req, res, next) => {
    const raw = req.cookies?.zosfas_session;
    const session = unsign(raw, jwtSecret);
    if (!session?.discordId) return res.status(401).json({ error: "not_authenticated" });
    req.session = session;
    next();
  };
}

async function startWebServer() {
  const PORT = parseInt(process.env.PORT || "3000", 10);

  const DISCORD_CLIENT_SECRET = mustEnv("DISCORD_CLIENT_SECRET");
  const DISCORD_REDIRECT_URI = mustEnv("DISCORD_REDIRECT_URI");
  const WEBSITE_JWT_SECRET = mustEnv("WEBSITE_JWT_SECRET");
  const WEBSITE_BASE_URL = process.env.WEBSITE_BASE_URL || `http://localhost:${PORT}`;
  const COOKIE_SECURE = String(process.env.COOKIE_SECURE || (process.env.NODE_ENV === "production")).toLowerCase() === "true";

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // --- Static UI (simple, member-friendly) ---
  app.get("/", (req, res) => {
    res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ZosfasGen</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#0b0d12;color:#e8e8ea}
      .wrap{max-width:880px;margin:0 auto;padding:28px}
      .card{background:#131724;border:1px solid #222a3d;border-radius:14px;padding:18px;margin:14px 0}
      .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
      input{background:#0e1220;border:1px solid #26304a;color:#e8e8ea;border-radius:10px;padding:12px 12px;min-width:240px}
      button,a.btn{background:#2d6cff;border:none;color:white;border-radius:10px;padding:12px 14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
      button.secondary{background:#2a2f3f}
      .muted{color:#a9b0c3}
      .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid #2a3552;background:#0e1220;font-weight:700}
      .ok{border-color:#1f7a4e}
      .warn{border-color:#7a4e1f}
      .err{border-color:#7a1f1f}
      ul{margin:10px 0 0 18px}
      li{margin:6px 0}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1 style="margin:0 0 6px">ZosfasGen</h1>
      <div class="muted">Use your Discord account. Premium members get ∞ downloads.</div>

      <div class="card" id="authCard">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="badge" id="statusBadge">Checking…</div>
            <div class="muted" id="statusSub" style="margin-top:6px"></div>
          </div>
          <div class="row">
            <a class="btn" href="/auth/discord" id="loginBtn">Login with Discord</a>
            <button class="secondary" id="logoutBtn" style="display:none">Logout</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:18px">Download</h2>
        <div class="row">
          <input id="appid" placeholder="Steam AppID (e.g. 570)" />
          <button id="dlBtn">Get download</button>
        </div>
        <div class="muted" style="margin-top:10px" id="dlMsg"></div>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px;font-size:18px">Recent downloads</h2>
        <div class="muted" id="recent">Log in to see your history.</div>
      </div>
    </div>

    <script>
      const badge = document.getElementById('statusBadge');
      const sub = document.getElementById('statusSub');
      const loginBtn = document.getElementById('loginBtn');
      const logoutBtn = document.getElementById('logoutBtn');
      const recent = document.getElementById('recent');
      const dlMsg = document.getElementById('dlMsg');

      function setBadge(text, cls){
        badge.textContent = text;
        badge.className = 'badge ' + (cls||'');
      }

      async function refreshMe(){
        try{
          const r = await fetch('/me');
          if(!r.ok) throw new Error('not');
          const me = await r.json();
          loginBtn.style.display='none';
          logoutBtn.style.display='inline-block';

          if(me.isPremium){
            setBadge('Premium: ∞', 'ok');
            sub.textContent = 'Unlimited downloads from web + Discord.';
          }else{
            setBadge(`Free: ${me.downloadsUsed24h}/5 used`, 'warn');
            sub.textContent = `Remaining: ${me.downloadsRemaining} (rolling 24h)`;
          }
          await refreshRecent();
        }catch{
          setBadge('Not logged in', 'err');
          sub.textContent = 'Log in with Discord to start downloading.';
          loginBtn.style.display='inline-block';
          logoutBtn.style.display='none';
          recent.textContent='Log in to see your history.';
        }
      }

      async function refreshRecent(){
        const r = await fetch('/downloads/recent');
        if(!r.ok) return;
        const list = await r.json();
        if(!list.length){ recent.textContent='No downloads yet.'; return; }
        const ul = document.createElement('ul');
        for(const it of list){
          const li = document.createElement('li');
          li.textContent = `${new Date(it.createdAt).toLocaleString()} — ${it.resource} (${it.source})`;
          ul.appendChild(li);
        }
        recent.innerHTML='';
        recent.appendChild(ul);
      }

      logoutBtn.onclick = async () => {
        await fetch('/logout', {method:'POST'});
        location.href = '/';
      };

      document.getElementById('dlBtn').onclick = async () => {
        dlMsg.textContent='';
        const appid = (document.getElementById('appid').value||'').trim();
        if(!appid){ dlMsg.textContent='Enter an AppID.'; return; }
        const r = await fetch('/downloads/start', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ resource: appid })
        });
        const j = await r.json().catch(()=>({}));
        if(!r.ok){
          dlMsg.textContent = j.error || 'Blocked.';
          await refreshMe();
          return;
        }
        if(j.url){
          dlMsg.innerHTML = `Ready: <a href="${j.url}" class="btn" style="margin-left:10px">Download ZIP</a>`;
        }else{
          dlMsg.textContent='Allowed, but no URL returned.';
        }
        await refreshMe();
      };

      refreshMe();
    </script>
  </body>
</html>`);
  });

  // --- Discord OAuth ---
  app.get("/auth/discord", (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("zosfas_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: "code",
      scope: "identify",
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  app.get("/auth/discord/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      const expected = req.cookies?.zosfas_oauth_state;
      if (!code || !state || !expected || String(state) !== String(expected)) {
        return res.status(400).send("Invalid OAuth state.");
      }

      // Exchange code for access token
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: DISCORD_REDIRECT_URI,
      });

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson?.access_token) {
        console.error("OAuth token exchange failed", tokenJson);
        return res.status(400).send("OAuth token exchange failed.");
      }

      const user = await fetchDiscordUser(tokenJson.access_token);
      if (!user?.id) return res.status(400).send("Failed to fetch user.");

      // Ensure they are in your guild (and get roles)
      const rolesInfo = await resolveRoles(user.id);

      const session = {
        discordId: user.id,
        username: user.username,
        avatar: user.avatar,
        isPremium: rolesInfo.isPremium,
        isAdmin: rolesInfo.isAdmin,
        iat: Date.now(),
      };

      res.clearCookie("zosfas_oauth_state");
      res.cookie("zosfas_session", sign(session, WEBSITE_JWT_SECRET), {
        httpOnly: true,
        sameSite: "lax",
        secure: COOKIE_SECURE,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.redirect(WEBSITE_BASE_URL + "/");
    } catch (e) {
      console.error(e);
      res.status(500).send("OAuth error.");
    }
  });

  app.post("/logout", (req, res) => {
    res.clearCookie("zosfas_session");
    res.json({ ok: true });
  });

  // --- Member API ---
  app.get("/me", requireAuth(WEBSITE_JWT_SECRET), async (req, res) => {
    const discordId = req.session.discordId;
    const { isPremium, isAdmin } = await resolveRoles(discordId);
    const usage = await getDailyUsage(discordId);
    const remaining = isPremium ? 0 : Math.max(0, config.LIMITS.FREE_DAILY_GENERATIONS - usage.count);
    res.json({
      discordId,
      username: req.session.username,
      avatar: req.session.avatar,
      isPremium,
      isAdmin,
      downloadsUsed24h: usage.count,
      downloadsRemaining: isPremium ? 0 : remaining,
      limit: config.LIMITS.FREE_DAILY_GENERATIONS,
    });
  });

  app.post("/me/refresh", requireAuth(WEBSITE_JWT_SECRET), async (req, res) => {
    const discordId = req.session.discordId;
    const { isPremium, isAdmin } = await resolveRoles(discordId);
    res.json({ isPremium, isAdmin });
  });

  app.post("/downloads/start", requireAuth(WEBSITE_JWT_SECRET), async (req, res) => {
    try {
      const discordId = req.session.discordId;
      const resource = String(req.body?.resource || "").trim();
      if (!resource) return res.status(400).json({ error: "missing_resource" });

      // 1) Premium check (role-based)
      const { isPremium } = await resolveRoles(discordId);

      // 2) Enforce limit + log usage
      const lim = await enforceDailyLimit(discordId, isPremium, "web", resource);
      if (!lim.ok) {
        return res.status(429).json({
          error: `Daily limit reached (${lim.limit}/day). Premium users have unlimited downloads.`,
          limit: lim.limit,
        });
      }

      // 3) GitHub zip lookup
      const info = await githubZipInfo(ghCfg(), resource);
      if (!info.ok) {
        return res.status(404).json({ error: "zip_not_found" });
      }

      return res.json({
        ok: true,
        url: info.url,
        size: info.size,
        tag: info.tag,
        remaining: lim.remaining,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/downloads/recent", requireAuth(WEBSITE_JWT_SECRET), async (req, res) => {
    const { listRecentDownloads } = require("../util/downloadLimit");
    const rows = await listRecentDownloads(req.session.discordId, 10);
    res.json(rows);
  });

  app.listen(PORT, () => {
    console.log(`Web server listening on :${PORT}`);
  });
}

module.exports = { startWebServer };
