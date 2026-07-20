const mongoose = require("mongoose");

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn("[MongoDB] MONGO_URI is missing. Server started without database access.");
    return;
  }
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[MongoDB] Database Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[MongoDB] Connection Error: ${error.message}`);
    process.exitCode = 1;
  }
};

module.exports = connectDB;
