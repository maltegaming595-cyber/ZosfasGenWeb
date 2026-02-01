# ZosfasGen Website (Synced)

This is a dashboard-style website (glassy dark UI + left sidebar) that exposes the same *functions* as your Discord bot,
but runs through a shared MongoDB + the bot token so both stay synced.

## What it includes
Tabs:
- Generator (post download embed in output channel)
- Tickets (creates Discord ticket channels with Close button)
- Premium (shows role/timer status)
- Boost (shows booster status)
- Giveaways (create/end/reroll – admin only)
- Codes (stock + print codes – admin only)
- Admin (premium activate, bot-ban, premium list)
- Links (dlc/online/store/premium info)
- Settings (diagnostics)

## Setup
1) Install deps:
```bash
npm install
```

2) Copy `.env.example` -> `.env` and fill it.

3) Run:
```bash
npm start
```

Open http://localhost:3001

## Notes
- Login uses Discord OAuth (identify + guilds).
- Admin check: requires Discord **Administrator** or **Manage Server**.
- Generator uses the same GitHub manifest + zip lookup logic as the bot:
  - `GITHUB_REPO`, `GITHUB_MANIFEST_URL`, `GITHUB_FALLBACK_TAG`
- Game name lookup is optional via `SEARCH_API_BASE` (same as bot). If unset, use numeric appids.



## Member-shareable improvements
- Public landing page at `/` (no login required)
- How-to page at `/howto.html`
- Dashboard at `/app.html`
- OpenGraph tags for nicer Discord embeds
- Optional env var for Discord invite link:
  - `DISCORD_INVITE_URL=https://discord.gg/yourinvite`

If `DISCORD_INVITE_URL` isn't set, the Discord button will be empty.
