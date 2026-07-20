const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

// 1. Load Environment Variables
dotenv.config();

// 2. Connect to MongoDB
connectDB().then(async () => {
  try {
    await require("./utils/seedVideos")();
  } catch (error) {
    console.warn("[Seed] Skipped:", error.message);
  }
});

const app = express();

// 3. Global Middlewares
app.use(express.json()); 
app.use(cookieParser()); 
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true, // Crucial for passing Secure Cookies later
  })
);

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api", require("./routes/platformRoutes"));
app.use("/api", require("./routes/watchPartyRoutes"));

const { pushSignal, getSignals, getChatHistory } = require("./utils/signaling");

// WebRTC + watch party signaling (offer/answer/ICE, chat, sync, presence).
app.post("/api/calls/:room/signal", (req, res) => {
  const { sender, type, payload } = req.body;
  if (!sender || !type) return res.status(400).json({ error: "sender and type are required." });
  const event = pushSignal(req.params.room, sender, type, payload);
  res.status(201).json({ delivered: true, id: event.id });
});
app.get("/api/calls/:room/signal", (req, res) => {
  const after = Number(req.query.after) || 0;
  res.json(getSignals(req.params.room, after, req.query.sender));
});
app.get("/api/calls/:room/chat", (req, res) => {
  res.json(getChatHistory(req.params.room, Number(req.query.limit) || 50));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

// 4. Health Check API Route
app.get("/", (req, res) => {
  res.status(200).json({ 
    status: "Online", 
    message: "Elevance Streaming Core Engine is fully operational." 
  });
});

// 5. Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] Live on: http://localhost:${PORT}`);
});
