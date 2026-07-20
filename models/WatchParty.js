const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    peerId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true },
    isHost: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    cameraOff: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const watchPartySchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    hostPeerId: { type: String, required: true },
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    participants: [participantSchema],
    playback: {
      isPlaying: { type: Boolean, default: false },
      currentTime: { type: Number, default: 0 },
      updatedAt: { type: Date, default: Date.now },
      updatedBy: { type: String, default: "" },
    },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

watchPartySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("WatchParty", watchPartySchema);
