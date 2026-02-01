const passportDiscord = require("passport-discord").Strategy;

function configurePassport(passport) {
  const clientID = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const callbackURL = process.env.DISCORD_REDIRECT_URI;

  if (!clientID || !clientSecret || !callbackURL) {
    console.warn("⚠️ Discord OAuth env missing. Login button will not work until configured.");
  }

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  passport.use(
    new passportDiscord(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ["identify", "guilds"],
      },
      (accessToken, refreshToken, profile, done) => {
        // Save tokens in session so API can call Discord REST on behalf of user if needed
        profile._accessToken = accessToken;
        return done(null, profile);
      }
    )
  );
}

module.exports = { configurePassport };
