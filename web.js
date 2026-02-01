// Standalone entrypoint to run ONLY the member website (no Discord bot).
require("dotenv").config();

const { connectMongo } = require("./src/mongo");
const { startWebServer } = require("./src/web/server");

(async () => {
  await connectMongo();
  await startWebServer();
})();
