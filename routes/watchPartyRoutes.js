const router = require("express").Router();
const crypto = require("crypto");
const optionalAuth = require("../middleware/optionalAuth");
const WatchParty = require("../models/WatchParty");
const Video = require("../models/Video");
const { pushSignal, getChatHistory } = require("../utils/signaling");

const createRoomCode = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const displayName = (req) => req.user?.name || req.body.displayName || req.body.hostName;

const loadParty = async (roomCode) => {
  const party = await WatchParty.findOne({ roomCode: roomCode.toUpperCase(), isActive: true })
    .populate("video")
    .populate("host", "name email");
  if (!party || party.expiresAt <= new Date()) return null;
  return party;
};

const isPartyHost = (party, user, peerId) => {
  if (peerId && party.hostPeerId === peerId) return true;
  if (user && party.host && String(party.host._id || party.host) === String(user.id)) return true;
  return party.participants.some((p) => p.peerId === peerId && p.isHost);
};

router.post("/watch-party", optionalAuth, async (req, res) => {
  const name = displayName(req);
  if (!name) return res.status(400).json({ error: "displayName is required." });

  const video = await Video.findById(req.body.videoId);
  if (!video) return res.status(404).json({ error: "Video not found." });

  let roomCode = createRoomCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = await WatchParty.exists({ roomCode });
    if (!exists) break;
    roomCode = createRoomCode();
  }

  const peerId = req.body.peerId || `peer-${crypto.randomUUID().slice(0, 8)}`;
  const party = await WatchParty.create({
    roomCode,
    host: req.user?.id || null,
    hostPeerId: peerId,
    video: video.id,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    participants: [
      {
        peerId,
        userId: req.user?.id || null,
        name,
        isHost: true,
        muted: false,
        cameraOff: false,
      },
    ],
  });

  const populated = await party.populate(["video", { path: "host", select: "name email" }]);

  pushSignal(roomCode, peerId, "join", {
    peerId,
    userId: req.user?.id || null,
    name,
    isHost: true,
    muted: false,
    cameraOff: false,
    participants: party.participants,
  });

  res.status(201).json({
    roomCode: populated.roomCode,
    inviteUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/watch-party/${populated.roomCode}`,
    party: populated,
    peerId,
    isHost: true,
    hostName: name,
  });
});

router.get("/watch-party/:roomCode", async (req, res) => {
  const party = await loadParty(req.params.roomCode);
  if (!party) return res.status(404).json({ error: "Watch party not found or expired." });
  res.json({
    roomCode: party.roomCode,
    video: party.video,
    host: party.host,
    hostPeerId: party.hostPeerId,
    participants: party.participants,
    playback: party.playback,
    chatHistory: getChatHistory(party.roomCode),
  });
});

router.post("/watch-party/:roomCode/join", optionalAuth, async (req, res) => {
  const party = await loadParty(req.params.roomCode);
  if (!party) return res.status(404).json({ error: "Watch party not found or expired." });

  const name = displayName(req);
  if (!name) return res.status(400).json({ error: "displayName is required." });

  const peerId = req.body.peerId || `peer-${crypto.randomUUID().slice(0, 8)}`;
  const existing = party.participants.find(
    (p) =>
      p.peerId === peerId ||
      (req.user && p.userId && String(p.userId) === String(req.user.id))
  );

  if (existing) {
    existing.name = name;
    existing.muted = Boolean(req.body.muted);
    existing.cameraOff = Boolean(req.body.cameraOff);
  } else {
    party.participants.push({
      peerId,
      userId: req.user?.id || null,
      name,
      isHost: party.hostPeerId === peerId,
      muted: Boolean(req.body.muted),
      cameraOff: Boolean(req.body.cameraOff),
    });
  }

  await party.save();

  pushSignal(party.roomCode, peerId, "join", {
    peerId,
    userId: req.user?.id || null,
    name,
    isHost: party.hostPeerId === peerId,
    muted: Boolean(req.body.muted),
    cameraOff: Boolean(req.body.cameraOff),
    participants: party.participants,
  });

  res.json({
    roomCode: party.roomCode,
    peerId,
    isHost: isPartyHost(party, req.user, peerId),
    party: await party.populate("video"),
    participants: party.participants,
    chatHistory: getChatHistory(party.roomCode),
  });
});

router.post("/watch-party/:roomCode/leave", optionalAuth, async (req, res) => {
  const party = await WatchParty.findOne({ roomCode: req.params.roomCode.toUpperCase(), isActive: true });
  if (!party) return res.status(404).json({ error: "Watch party not found." });

  const leavingPeerId = req.body.peerId || (req.user ? String(req.user.id) : null);

  party.participants = party.participants.filter((p) => {
    if (req.body.peerId) return p.peerId !== req.body.peerId;
    if (req.user) return String(p.userId) !== String(req.user.id);
    return true;
  });

  if (party.participants.length === 0) {
    party.isActive = false;
  }

  await party.save();

  if (leavingPeerId) {
    pushSignal(party.roomCode, leavingPeerId, "leave", {
      peerId: leavingPeerId,
      participants: party.participants,
    });
  }

  res.json({ success: true, participants: party.participants });
});

router.patch("/watch-party/:roomCode/playback", optionalAuth, async (req, res) => {
  const party = await loadParty(req.params.roomCode);
  if (!party) return res.status(404).json({ error: "Watch party not found or expired." });

  const peerId = req.body.peerId || "";
  if (!isPartyHost(party, req.user, peerId)) {
    return res.status(403).json({ error: "Only the host can control playback." });
  }

  party.playback = {
    isPlaying: Boolean(req.body.isPlaying),
    currentTime: Math.max(0, Number(req.body.currentTime) || 0),
    updatedAt: new Date(),
    updatedBy: peerId,
  };

  await party.save();
  res.json({ playback: party.playback });
});

router.patch("/watch-party/:roomCode/participant", optionalAuth, async (req, res) => {
  const party = await loadParty(req.params.roomCode);
  if (!party) return res.status(404).json({ error: "Watch party not found or expired." });

  const participant = party.participants.find((p) => p.peerId === req.body.peerId);
  if (!participant) return res.status(404).json({ error: "Participant not found." });

  if (req.user && participant.userId && String(participant.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: "Cannot update this participant." });
  }

  if (typeof req.body.muted === "boolean") participant.muted = req.body.muted;
  if (typeof req.body.cameraOff === "boolean") participant.cameraOff = req.body.cameraOff;

  await party.save();

  pushSignal(party.roomCode, req.body.peerId, "presence", {
    peerId: req.body.peerId,
    muted: participant.muted,
    cameraOff: participant.cameraOff,
    participants: party.participants,
  });

  res.json({ participant, participants: party.participants });
});

module.exports = router;
