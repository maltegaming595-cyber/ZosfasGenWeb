const https = require("https");

function fetchText(url, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "GET", headers: { "User-Agent": "ZosfasBot" } },
      (res) => {
        const code = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && maxRedirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return fetchText(next, maxRedirects - 1).then(resolve).catch(reject);
        }

        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: code, text: data }));
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function headWithRedirects(url, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "HEAD", headers: { "User-Agent": "ZosfasBot" } },
      (res) => {
        const code = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && maxRedirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return headWithRedirects(next, maxRedirects - 1).then(resolve).catch(reject);
        }

        const len = res.headers["content-length"]
          ? parseInt(res.headers["content-length"], 10)
          : null;

        res.resume();

        resolve({
          status: code,
          ok: code >= 200 && code < 400, // ✅ allow redirects
          contentLength: Number.isFinite(len) ? len : null,
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function rangeSize(url, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "GET", headers: { "User-Agent": "ZosfasBot", Range: "bytes=0-0" } },
      (res) => {
        const code = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && maxRedirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return rangeSize(next, maxRedirects - 1).then(resolve).catch(reject);
        }

        const cr = res.headers["content-range"];
        res.resume();

        if (code === 206 && typeof cr === "string" && cr.includes("/")) {
          const total = parseInt(cr.split("/")[1], 10);
          if (Number.isFinite(total)) return resolve(total);
        }
        resolve(null);
      }
    );

    req.on("error", reject);
    req.end();
  });
}

// ---- Manifest cache ----
let manifest = null;
let manifestLoadedAt = 0;
const MANIFEST_TTL_MS = 5 * 60 * 1000;

async function loadManifestOnce(manifestUrl) {
  if (!manifestUrl) return null;

  const now = Date.now();
  if (manifest && now - manifestLoadedAt < MANIFEST_TTL_MS) return manifest;

  const res = await fetchText(manifestUrl);
  if (res.status !== 200) return manifest;

  try {
    const parsed = JSON.parse(res.text);
    if (parsed && typeof parsed === "object") {
      manifest = parsed;
      manifestLoadedAt = now;
      return manifest;
    }
  } catch {}
  return manifest;
}

function buildUrl(repo, tag, appid) {
  return `https://github.com/${repo}/releases/download/${tag}/${appid}.zip`;
}

async function githubZipInfo({ repo, manifestUrl, fallbackTag }, appid) {
  const man = await loadManifestOnce(manifestUrl);
  const tag = man && man[String(appid)] ? String(man[String(appid)]) : String(fallbackTag);

  const url = buildUrl(repo, tag, appid);

  const head = await headWithRedirects(url);
  if (!head.ok) return { ok: false, url, size: null, tag, status: head.status };

  if (head.contentLength != null) return { ok: true, url, size: head.contentLength, tag, status: head.status };

  const rs = await rangeSize(url);
  return { ok: true, url, size: rs, tag, status: head.status };
}

module.exports = { githubZipInfo };
