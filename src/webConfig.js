require("dotenv").config();

module.exports = {
  searchApiBase: process.env.SEARCH_API_BASE || "",
  GITHUB: {
    REPO: process.env.GITHUB_REPO || "maltegaming595-cyber/ZosfasGenLocal",
    MANIFEST_URL:
      process.env.GITHUB_MANIFEST_URL ||
      "https://raw.githubusercontent.com/maltegaming595-cyber/ZosfasGenLocal/main/manifest.json",
    FALLBACK_TAG: process.env.GITHUB_FALLBACK_TAG || "files-000",
  },
};
