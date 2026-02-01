const { searchApiBase } = require("../webConfig");

function isNumeric(s) {
  return /^\d+$/.test(String(s).trim());
}

// Calls external API:
// GET {SEARCH_API_BASE}/search?q=<query>
// Expected JSON: [{appid:number|string, name:string}, ...]
async function searchGamesByName(query) {
  if (!searchApiBase) return [];
  const q = String(query || "").trim();
  if (!q) return [];

  const url = new URL("/search", searchApiBase);
  url.searchParams.set("q", q);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "User-Agent": "ZosfasBot", "Accept": "application/json" }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map(x => ({ appid: String(x.appid), name: String(x.name || "") }))
      .filter(x => /^\d+$/.test(x.appid) && x.name.length > 0)
      .slice(0, 25);
  } catch {
    return [];
  }
}

module.exports = { isNumeric, searchGamesByName };
