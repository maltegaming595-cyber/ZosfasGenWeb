const path = require("path");
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const morgan = require("morgan");
const passport = require("passport");

const { initDiscordClient } = require("./src/discord");
const { connectMongo } = require("./src/db");
const { configurePassport } = require("./src/auth");
const apiRouter = require("./src/routes/api");
const { startGiveawayScheduler } = require("./src/scheduler/giveawayScheduler");

const PORT = parseInt(process.env.PORT || "3001", 10);

async function main() {
  await connectMongo(process.env.MONGODB_URI);
  await initDiscordClient(process.env.DISCORD_TOKEN);
  startGiveawayScheduler({ intervalMs: parseInt(process.env.GIVEAWAY_SCHEDULER_MS || "20000", 10) });

  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet({ contentSecurityPolicy: false })); // CSP off for simple static assets
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  configurePassport(passport);
  app.use(passport.initialize());
  app.use(passport.session());

  // Auth routes
  app.get("/auth/discord", passport.authenticate("discord"));
  app.get(
    "/auth/discord/callback",
    passport.authenticate("discord", { failureRedirect: "/" }),
    (req, res) => res.redirect("/")
  );

  app.post("/auth/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => res.json({ ok: true }));
    });
  });

  // API
  app.use("/api", apiRouter);

  // Static UI
  app.use("/", express.static(path.join(__dirname, "web"), { extensions: ["html"] }));

  // SPA fallback
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "web", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`✅ Web running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
