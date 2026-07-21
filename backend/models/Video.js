const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    thumbnailUrl: { type: String, default: "" },
    sourceUrl: { type: String, required: true },
    durationSeconds: { type: Number, default: 0 },
    category: { type: String, default: "General", trim: true },
    isPremium: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Video", videoSchema);
