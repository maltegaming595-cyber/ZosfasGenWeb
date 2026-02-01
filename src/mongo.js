const mongoose = require("mongoose");
const { mongoUri } = require("./config");

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
}

module.exports = { connectMongo };
