const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

// 1. Load Environment Variables
dotenv.config();

// 2. Connect to MongoDB
connectDB();

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

// Lightweight WebRTC signaling. Media remains peer-to-peer; stale events expire automatically.
const callRooms = new Map();
let signalId = 0;
app.post("/api/calls/:room/signal", (req, res) => {
  const room = req.params.room.toUpperCase();
  const events = callRooms.get(room) || [];
  events.push({ id: ++signalId, sender: req.body.sender, type: req.body.type, payload: req.body.payload, createdAt: Date.now() });
  callRooms.set(room, events.filter(event => Date.now() - event.createdAt < 10 * 60 * 1000));
  res.status(201).json({ delivered: true });
});
app.get("/api/calls/:room/signal", (req, res) => {
  const after = Number(req.query.after) || 0;
  const events = (callRooms.get(req.params.room.toUpperCase()) || []).filter(event => event.id > after && event.sender !== req.query.sender);
  res.json(events);
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
