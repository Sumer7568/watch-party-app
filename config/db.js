const mongoose = require("mongoose");

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn("[MongoDB] MONGO_URI is missing. Server started without database access.");
    return false;
  }
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[MongoDB] Database Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`[MongoDB] Connection Error: ${error.message}`);
    process.exitCode = 1;
    return false;
  }
};

module.exports = connectDB;
