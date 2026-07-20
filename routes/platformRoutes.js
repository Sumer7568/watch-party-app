const router = require("express").Router();
const crypto = require("crypto");
const auth = require("../middleware/auth");
const { moderateComment, sanitizeLocation } = require("../middleware/commentModeration");
const Comment = require("../models/Comment");
const Video = require("../models/Video");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

const PLAN_LIMITS = { Free: 300, Bronze: 420, Silver: 600, Gold: Infinity };
const PRICES = { Bronze: 10, Silver: 50, Gold: 100 };
const dateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

router.get("/videos", async (_req, res) => res.json(await Video.find().sort({ createdAt: -1 })));

// 1. Get Comments
router.get("/videos/:videoId/comments", async (req, res) => {
  const comments = await Comment.find({ video: req.params.videoId })
    .populate("user", "name")
    .sort({ createdAt: -1 });
  res.json(comments);
});

// 2. Post New Comment (With Abuse & Spam Moderation + Location Privacy Sanitization)
router.post("/videos/:videoId/comments", auth, moderateComment, async (req, res) => {
  const sanitizedLoc = sanitizeLocation(req.user, req.body.location);
  const comment = await Comment.create({
    video: req.params.videoId,
    user: req.user.id,
    city: req.user.city,
    location: sanitizedLoc,
    text: req.body.text.trim(),
    originalLanguage: req.body.originalLanguage || "en",
  });
  const populated = await comment.populate("user", "name");
  res.status(201).json(populated);
});

// 3. React to Comment (Like / Dislike) - Preserved, Never Automatically Deleted
router.post("/comments/:id/react", auth, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found." });

  const isDislike = req.body.type === "dislike";
  const field = isDislike ? "dislikes" : "likes";
  const other = isDislike ? "likes" : "dislikes";

  if (isDislike && comment.user.equals(req.user.id)) {
    return res.status(400).json({ error: "You cannot dislike your own comment." });
  }

  comment[other] = comment[other].filter((id) => !id.equals(req.user.id));

  const alreadyReacted = comment[field].some((id) => id.equals(req.user.id));
  if (alreadyReacted) {
    comment[field] = comment[field].filter((id) => !id.equals(req.user.id));
  } else {
    comment[field].push(req.user.id);
  }

  await comment.save();
  const updated = await Comment.findById(comment.id).populate("user", "name");
  res.json(updated);
});

// 4. Report Comment Endpoint (Increments reportCount, sets isFlagged = true for Admin Review, Never Auto-Deletes)
router.post("/comments/:id/report", auth, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found." });

  const alreadyReported = comment.reports.some((id) => id.equals(req.user.id));
  if (!alreadyReported) {
    comment.reports.push(req.user.id);
    comment.reportCount += 1;
    comment.isFlagged = true;
    await comment.save();
  }

  const updated = await Comment.findById(comment.id).populate("user", "name");
  res.json({ success: true, message: "Comment reported for review.", comment: updated });
});

// 5. Delete Comment Endpoint (Author or Admin Only)
router.delete("/comments/:id", auth, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found." });

  const isAuthor = comment.user.equals(req.user.id);
  const isAdmin = req.user.role === "admin";

  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: "Unauthorized: You can only delete your own comments." });
  }

  await comment.deleteOne();
  res.json({ success: true, message: "Comment deleted successfully." });
});

// Dictionary for common Hinglish & Hindi phrases
const HINGLISH_DICTIONARY = {
  "acha video tha ye": "This was a good video.",
  "accha video tha ye": "This was a good video.",
  "achha video tha ye": "This was a good video.",
  "acha video tha": "This was a good video.",
  "accha video tha": "This was a good video.",
  "achha video tha": "This was a good video.",
  "bahut badiya stream": "Very awesome stream.",
  "bohot accha video": "Very good video.",
  "kya mast video hai": "What a great video this is!",
  "maza aa gaya": "I really enjoyed this!",
  "bhai super video": "Brother, super video!",
  "badiya": "Great!",
  "accha": "Good!",
  "bahut accha": "Very good!",
  "namaste": "Hello!",
  "shukriya": "Thank you!",
  "dhanyawad": "Thank you!",
};

const translateText = async (text, targetLang = "en") => {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Exact phrase lookup in Hinglish dictionary
  if (HINGLISH_DICTIONARY[lower]) {
    return HINGLISH_DICTIONARY[lower];
  }

  // 2. Partial phrase lookup in Hinglish dictionary
  for (const [key, value] of Object.entries(HINGLISH_DICTIONARY)) {
    if (lower.includes(key)) {
      return lower.replace(key, value);
    }
  }

  // 3. Try Google GTX free translation endpoint
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map((part) => part[0]).join("").trim();
        if (translated && translated.toLowerCase() !== lower) return translated;
      }
    }
  } catch (err) {
    console.error("Google GTX Translation Error:", err.message);
  }

  // 4. Try MyMemory Free Translation API as secondary fallback
  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=autodetect|${targetLang}`;
    const response = await fetch(mmUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.responseData && data.responseData.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (err) {
    console.error("MyMemory Translation Error:", err.message);
  }

  // Fallback: Word-by-word substitution for Hinglish terms
  let translatedStr = clean
    .replace(/\bacha\b/gi, "good")
    .replace(/\baccha\b/gi, "good")
    .replace(/\bachha\b/gi, "good")
    .replace(/\btha\b/gi, "was")
    .replace(/\bye\b/gi, "this")
    .replace(/\bbahut\b/gi, "very")
    .replace(/\bbohot\b/gi, "very")
    .replace(/\bbadiya\b/gi, "great")
    .replace(/\bmast\b/gi, "awesome")
    .replace(/\bhai\b/gi, "is");

  return translatedStr !== clean ? translatedStr : `Translated: ${clean}`;
};

// 6. Translation Endpoint
router.post("/translate", auth, async (req, res) => {
  const text = (req.body.text || "").trim();
  const targetLanguage = req.body.targetLanguage || "en";

  if (!text) {
    return res.status(400).json({ error: "Text to translate is required." });
  }

  if (process.env.TRANSLATE_API_URL) {
    try {
      const response = await fetch(process.env.TRANSLATE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: "auto",
          target: targetLanguage,
          api_key: process.env.TRANSLATE_API_KEY,
        }),
      });
      const data = await response.json();
      if (response.ok && data.translatedText) {
        return res.json({ translatedText: data.translatedText, originalText: text });
      }
    } catch {
      // Fallback below
    }
  }

  const translatedText = await translateText(text, targetLanguage);
  res.json({
    translatedText,
    originalText: text,
    targetLanguage,
    success: true,
  });
});

const DOWNLOAD_LIMITS = { Free: 1, Bronze: 3, Silver: 5, Gold: Infinity };

router.post("/videos/:videoId/download", auth, async (req, res) => {
  const today = dateKey();
  if (req.user.lastDownloadDate !== today) { req.user.dailyDownloads = 0; req.user.lastDownloadDate = today; }
  
  const limit = DOWNLOAD_LIMITS[req.user.plan] || 1;
  if (req.user.dailyDownloads >= limit) {
    return res.status(402).json({ error: `Daily download limit of ${limit} reached for ${req.user.plan} plan.`, upgradeRequired: true });
  }

  const video = await Video.findById(req.params.videoId);
  if (!video) return res.status(404).json({ error: "Video not found." });
  
  req.user.dailyDownloads += 1;
  if (!req.user.downloadedVideos.some(id => id.equals(video.id))) req.user.downloadedVideos.push(video.id);
  req.user.downloadHistory.push({ video: video.id, plan: req.user.plan });
  
  await req.user.save(); 
  res.json({ downloadUrl: video.sourceUrl, downloadsToday: req.user.dailyDownloads, limit });
});

router.get("/downloads", auth, async (req, res) => {
  const user = await User.findById(req.user.id).populate("downloadHistory.video");
  res.json(user.downloadHistory || []);
});

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

const handlePaymentVerification = async (req, res) => {
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      plan,
    } = req.body;

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({ error: "Invalid plan selected." });
    }

    const demo = orderId?.startsWith("order_demo_");
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "demo")
      .update(`${orderId || ""}|${paymentId || ""}`)
      .digest("hex");

    if (!demo && expectedSignature !== signature) {
      return res.status(400).json({ error: "Payment signature verification failed." });
    }

    const invoiceId = `ELV-${Date.now()}`;
    const amountPaid = PRICES[plan];
    const txnRef = paymentId || `DEMO-TXN-${Date.now()}`;

    req.user.plan = plan;
    req.user.paymentHistory.push({
      plan,
      amount: amountPaid,
      paymentId: txnRef,
      invoiceId,
      paidAt: new Date(),
    });
    await req.user.save();

    console.log(`[Payment Verified] Plan updated to '${plan}' for user: ${req.user.email}. Invoice: ${invoiceId}`);

    const emailSubject = `Elevance Subscription Invoice - ${invoiceId}`;
    const invoiceMessage = `
ELEVANCE STREAMING PLATFORM INVOICE
=====================================
Invoice ID: ${invoiceId}
Customer Name: ${req.user.name}
Customer Email: ${req.user.email}
Plan Upgraded: ${plan} Plan
Amount Paid: ₹${amountPaid}
Transaction Reference: ${txnRef}
Date: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

Thank you for upgrading to Elevance ${plan}! You now have full access to high-tier streaming features.
    `.trim();

    const invoiceHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
        <div style="background-color: #111827; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #10b981; margin: 0; font-size: 24px;">Elevance Streaming</h1>
          <p style="color: #9ca3af; margin: 5px 0 0 0; font-size: 14px;">Official Payment Invoice</p>
        </div>
        <div style="padding: 20px; color: #1f2937;">
          <p style="font-size: 16px;">Hi <strong>${req.user.name}</strong>,</p>
          <p style="font-size: 14px; color: #4b5563;">Thank you for your payment! Your subscription plan has been successfully upgraded to <strong>${plan}</strong>.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px; font-weight: bold; border: 1px solid #e5e7eb;">Invoice ID</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb; font-family: monospace;">${invoiceId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold; border: 1px solid #e5e7eb;">Plan</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #10b981; font-weight: bold;">${plan} Plan</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px; font-weight: bold; border: 1px solid #e5e7eb;">Amount Paid</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">₹${amountPaid}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold; border: 1px solid #e5e7eb;">Transaction Ref</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb; font-family: monospace;">${txnRef}</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px; font-weight: bold; border: 1px solid #e5e7eb;">Date</td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
            </tr>
          </table>
        </div>
        <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; color: #6b7280; font-size: 12px;">
          Need help? Reply to this email or contact support@elevance.io
        </div>
      </div>
    `;

    try {
      await sendEmail({
        email: req.user.email,
        subject: emailSubject,
        message: invoiceMessage,
        html: invoiceHtml,
      });
    } catch (emailErr) {
      console.error(`[Invoice Email Error]: Failed to deliver invoice email to ${req.user.email}. Details:`, emailErr.message);
    }

    res.json({
      success: true,
      plan,
      invoiceId,
      amount: amountPaid,
      paymentId: txnRef,
    });
  } catch (err) {
    console.error("[Payment Verification Error]:", err.message);
    res.status(500).json({ error: "Failed to verify payment." });
  }
};

router.post("/payments/verify", auth, handlePaymentVerification);
router.post("/subscription/verify-payment", auth, handlePaymentVerification);

module.exports = router;
