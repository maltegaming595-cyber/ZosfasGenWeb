# Zosfas Discord Bot

## What it does
- `/generate` (aliases `/gen`, `/request`) -> verifies GitHub release zip exists, includes file size, posts embed + download button.
- `/update` -> sends request to the update channel.
- Premium (MongoDB) -> auto removes role when time expires.
- Daily limits: free users 5 generations/day, premium unlimited.
- Bot-ban blocks all commands except ticket commands.
- Ticket system with topic dropdown, close locks user, transcript sent to log channel, auto-delete in 24h.
- Codes: `/code-stock`, `/code-remove`, `/game-code` (button dispense with stock counts).

## Setup
1. Install Node.js 18+.
2. Copy `.env.example` to `.env` and fill values.
3. `npm install`
4. Register commands: `npm run register`
5. Run: `npm start`

## External Search API (Option B)
Bot calls:
`GET {SEARCH_API_BASE}/search?q=<query>`

Expected JSON response (array):
```json
[
  {"appid": 220200, "name": "Kerbal Space Program"},
  {"appid": 1206560, "name": "Example Game"}
]
```

Return an empty array if no matches.

