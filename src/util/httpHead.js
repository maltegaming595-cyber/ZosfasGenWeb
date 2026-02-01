const https = require("https");

function headOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "HEAD", headers: { "User-Agent": "zosfas-bot" } }, (res) => {
      resolve(res);
    });
    req.on("error", reject);
    req.end();
  });
}

async function headFollow(url, maxRedirects = 5) {
  let current = url;

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await headOnce(current);

    // GitHub often returns 302/301 to an S3 URL
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      current = res.headers.location;
      continue;
    }

    return {
      ok: res.statusCode >= 200 && res.statusCode < 400, // <-- IMPORTANT
      status: res.statusCode,
      finalUrl: current,
      size: res.headers["content-length"] ? Number(res.headers["content-length"]) : null,
    };
  }

  return { ok: false, status: 0, finalUrl: current, size: null };
}

module.exports = { headFollow };
