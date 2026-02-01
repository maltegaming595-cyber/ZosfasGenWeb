function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "not_logged_in" });
  next();
}

module.exports = { requireLogin };
