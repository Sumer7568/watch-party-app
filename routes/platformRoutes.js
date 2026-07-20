const router = require("express").Router();
const crypto = require("crypto");
const auth = require("../middleware/auth");
const Comment = require("../models/Comment");
const Video = require("../models/Video");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

const PLAN_LIMITS = { Free: 300, Bronze: 420, Silver: 600, Gold: Infinity };
const PRICES = { Bronze: 10, Silver: 50, Gold: 100 };
const dateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const validComment = (value) => typeof value === "string" && value.trim() && value.length <= 240 && !/[^\p{L}\p{N}\p{M}\s.,!?'-]/u.test(value);

router.get("/videos", async (_req, res) => res.json(await Video.find().sort({ createdAt: -1 })));
router.get("/videos/:videoId/comments", async (req, res) => res.json(await Comment.find({ video: req.params.videoId }).populate("user", "name").sort({ createdAt: -1 })));
router.post("/videos/:videoId/comments", auth, async (req, res) => {
  if (!validComment(req.body.text)) return res.status(400).json({ error: "Only letters, numbers, spaces and basic punctuation are allowed." });
  const comment = await Comment.create({ video: req.params.videoId, user: req.user.id, city: req.user.city, text: req.body.text.trim() });
  res.status(201).json(await comment.populate("user", "name"));
});
router.post("/comments/:id/react", auth, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  const field = req.body.type === "dislike" ? "dislikes" : "likes";
  if (field === "dislikes" && comment.user.equals(req.user.id)) return res.status(400).json({ error: "You cannot dislike your own comment." });
  const other = field === "likes" ? "dislikes" : "likes";
  comment[other] = comment[other].filter(id => !id.equals(req.user.id));
  if (!comment[field].some(id => id.equals(req.user.id))) comment[field].push(req.user.id);
  if (comment.dislikes.length >= 2) { await comment.deleteOne(); return res.json({ removed: true }); }
  await comment.save(); res.json(comment);
});
router.post("/translate", auth, async (req, res) => {
  if (!process.env.TRANSLATE_API_URL) return res.json({ translatedText: req.body.text, demo: true, message: "Configure TRANSLATE_API_URL for live translation." });
  const response = await fetch(process.env.TRANSLATE_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: req.body.text, source: "auto", target: req.body.targetLanguage || "en", api_key: process.env.TRANSLATE_API_KEY }) });
  const data = await response.json(); res.status(response.ok ? 200 : 502).json(data);
});
router.post("/videos/:videoId/download", auth, async (req, res) => {
  const today = dateKey();
  if (req.user.lastDownloadDate !== today) { req.user.dailyDownloads = 0; req.user.lastDownloadDate = today; }
  if (req.user.plan === "Free" && req.user.dailyDownloads >= 1) return res.status(402).json({ error: "Daily free download used.", upgradeRequired: true });
  const video = await Video.findById(req.params.videoId);
  if (!video) return res.status(404).json({ error: "Video not found." });
  req.user.dailyDownloads += 1;
  if (!req.user.downloadedVideos.some(id => id.equals(video.id))) req.user.downloadedVideos.push(video.id);
  await req.user.save(); res.json({ downloadUrl: video.sourceUrl, downloadsToday: req.user.dailyDownloads });
});
router.get("/downloads", auth, async (req, res) => res.json((await User.findById(req.user.id).populate("downloadedVideos")).downloadedVideos));
router.post("/watch", auth, async (req, res) => {
  const today = dateKey(); if (req.user.lastWatchDate !== today) { req.user.dailyWatchSeconds = 0; req.user.lastWatchDate = today; }
  req.user.dailyWatchSeconds += Math.max(0, Math.min(Number(req.body.seconds) || 0, 30)); await req.user.save();
  const limit = PLAN_LIMITS[req.user.plan]; res.json({ allowed: req.user.dailyWatchSeconds < limit, usedSeconds: req.user.dailyWatchSeconds, limitSeconds: Number.isFinite(limit) ? limit : null });
});
router.get("/experience", auth, (req, res) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const south = ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana"].includes(req.user.state.toLowerCase());
  res.json({ theme: south && hour >= 10 && hour < 12 ? "light" : "dark", otpChannel: south ? "email" : "mobile", city: req.user.city });
});
router.post("/payments/order", auth, async (req, res) => {
  const amount = PRICES[req.body.plan]; if (!amount) return res.status(400).json({ error: "Invalid plan." });
  if (!process.env.RAZORPAY_KEY_ID) return res.json({ demo: true, order: { id: `order_demo_${Date.now()}`, amount: amount * 100, currency: "INR" }, key: "rzp_test_demo" });
  const basic = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: amount * 100, currency: "INR", receipt: `elv_${Date.now()}` }) });
  res.status(response.status).json({ order: await response.json(), key: process.env.RAZORPAY_KEY_ID });
});
router.post("/payments/verify", auth, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, plan } = req.body;
  if (!PRICES[plan]) return res.status(400).json({ error: "Invalid plan." });
  const demo = orderId?.startsWith("order_demo_");
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "demo").update(`${orderId}|${paymentId}`).digest("hex");
  if (!demo && expected !== signature) return res.status(400).json({ error: "Payment signature verification failed." });
  req.user.plan = plan; const invoiceId = `ELV-${Date.now()}`; req.user.paymentHistory.push({ plan, amount: PRICES[plan], paymentId, invoiceId }); await req.user.save();
  await sendEmail({ email: req.user.email, subject: `Elevance invoice ${invoiceId}`, message: `Payment successful\nInvoice: ${invoiceId}\nPlan: ${plan}\nAmount: ₹${PRICES[plan]}` });
  res.json({ success: true, plan, invoiceId });
});

module.exports = router;
