const mongoose = require("mongoose");

const paymentHistorySchema = new mongoose.Schema(
  {
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentId: { type: String, required: true },
    invoiceId: { type: String, required: true },
    paidAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const downloadHistorySchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    plan: { type: String, required: true },
    downloadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, default: "N/A", trim: true },
    password: { type: String, required: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    isVerified: { type: Boolean, default: false },
    otp: String,
    otpExpires: Date,
    plan: {
      type: String,
      enum: ["Free", "Bronze", "Silver", "Gold"],
      default: "Free",
    },
    dailyDownloads: { type: Number, default: 0 },
    lastDownloadDate: String,
    dailyWatchSeconds: { type: Number, default: 0 },
    lastWatchDate: String,
    downloadedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
    paymentHistory: [paymentHistorySchema],
    downloadHistory: [downloadHistorySchema],
    themePreference: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "auto",
    },
    knownLocations: [
      {
        city: String,
        state: String,
      },
    ],
    knownDevices: [{ type: String }],
    otpCode: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

