function parseDuration(input) {
  const s = String(input).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult = unit === "s" ? 1000
    : unit === "m" ? 60 * 1000
    : unit === "h" ? 60 * 60 * 1000
    : unit === "d" ? 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;
  return n * mult;
}
module.exports = { parseDuration };
