const mongoose = require("mongoose");

async function connectMongo(uri) {
  if (!uri) throw new Error("MONGODB_URI missing");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("✅ MongoDB connected");
}

module.exports = { connectMongo };
