const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { registerUser } = require("../controllers/authController");
const sendEmail = require("../utils/sendEmail");
const sendSms = require("../utils/sendSms");

const isSouthIndianState = (stateName = "") =>
  ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana"].includes(
    stateName.trim().toLowerCase()
  );

const createOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  city: user.city,
  state: user.state,
  plan: user.plan,
  paymentHistory: user.paymentHistory || [],
  themePreference: user.themePreference || "auto",
  knownLocations: user.knownLocations || [],
  knownDevices: user.knownDevices || [],
});

const issueSession = (res, user) => {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  return res
    .cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    .json({ success: true, user: publicUser(user) });
};

// Helper: Geolocation from IP
const detectClientIpAndLocation = async (req) => {
  const rawIp =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  const ip = rawIp.split(",")[0].trim();

  let city = req.body?.city || "Local City";
  let state = req.body?.state || "Local State";

  const isLocalIp =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.includes("127.0.0.1") ||
    ip.includes("::ffff:127.0.0.1") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.");

  if (!isLocalIp) {
    try {
      const response = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName`
      );
      const data = await response.json();
      if (data.status === "success") {
        city = data.city || city;
        state = data.regionName || state;
      }
    } catch (e) {
      console.error("IP Geolocation Error:", e.message);
    }
  }
  return { ip, city, state, isLocalIp };
};

// Helper: Extract Device from User-Agent
const detectDevice = (req) => {
  const userAgent = req.headers["user-agent"] || "Unknown Device";
  if (/mobile/i.test(userAgent)) return "Mobile Browser";
  if (/windows/i.test(userAgent)) return "Windows PC";
  if (/macintosh/i.test(userAgent)) return "Mac PC";
  if (/linux/i.test(userAgent)) return "Linux PC";
  return "Desktop Browser";
};

const sendRegionalOtp = async (user, purpose) => {
  const otp = createOtp();
  user.otp = otp;
  user.otpCode = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  console.log("TEST OTP GENERATED:", otp, "FOR USER EMAIL:", user.email);

  await sendEmail({
    email: user.email,
    subject: `Elevance ${purpose} OTP`,
    message: `Hello ${user.name},\n\nYour Elevance ${purpose.toLowerCase()} OTP is: ${otp}\n\nValid for 10 minutes.`,
  });

  return { channel: "email", region: "Email Verification", otp };
};

router.post("/register", registerUser);

router.post("/verify", async (req, res) => {
  const user = await User.findOne({
    _id: req.body.userId,
    $or: [{ otp: req.body.otp }, { otpCode: req.body.otp }],
    otpExpires: { $gt: new Date() },
  });
  if (!user) return res.status(400).json({ error: "Invalid or expired OTP." });
  user.isVerified = true;
  user.otp = undefined;
  user.otpCode = undefined;
  user.otpExpires = undefined;

  // Record location & device
  const device = detectDevice(req);
  if (!user.knownDevices.includes(device)) user.knownDevices.push(device);
  const geo = await detectClientIpAndLocation(req);
  const locCity = req.body.city || geo.city || user.city;
  const locState = req.body.state || geo.state || user.state;
  const hasLoc = user.knownLocations.some(
    (l) => l.city.toLowerCase() === locCity.toLowerCase() && l.state.toLowerCase() === locState.toLowerCase()
  );
  if (!hasLoc) user.knownLocations.push({ city: locCity, state: locState });

  await user.save();
  issueSession(res, user);
});

// Security 2FA Verification Endpoint
router.post("/verify-otp", async (req, res) => {
  const { userId, tempToken, otp, city, state, device } = req.body;
  const targetId = userId || tempToken;
  const user = await User.findOne({
    _id: targetId,
    $or: [{ otp: otp }, { otpCode: otp }],
    otpExpires: { $gt: new Date() },
  });
  if (!user) return res.status(400).json({ error: "Invalid or expired OTP code." });

  // Add new location and device to known arrays in MongoDB
  const newDevice = device || detectDevice(req);
  if (!user.knownDevices.includes(newDevice)) user.knownDevices.push(newDevice);

  const geo = await detectClientIpAndLocation(req);
  const locCity = city || geo.city || user.city;
  const locState = state || geo.state || user.state;
  const hasLoc = user.knownLocations.some(
    (l) => l.city.toLowerCase() === locCity.toLowerCase() && l.state.toLowerCase() === locState.toLowerCase()
  );
  if (!hasLoc) user.knownLocations.push({ city: locCity, state: locState });

  user.isVerified = true;
  user.otp = undefined;
  user.otpCode = undefined;
  user.otpExpires = undefined;
  await user.save();

  issueSession(res, user);
});

// Login Endpoint with Geolocation & Temporary Forced 2FA for Email Testing
router.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password || "", user.password)))
    return res.status(401).json({ error: "Invalid credentials." });

  // Temporarily force OTP to true for live email testing
  const isSecurityMismatch = true;

  if (isSecurityMismatch || !user.isVerified) {
    const delivery = await sendRegionalOtp(user, "Security 2FA Login");
    return res.json({
      success: true,
      requiresOtp: true,
      otpRequired: true,
      userId: user._id,
      tempToken: user._id,
      region: delivery.region,
      authMethod: delivery.channel === "email" ? "Email" : "Mobile SMS",
      message: `Security check: Unrecognized device/location. OTP sent to your registered ${
        delivery.channel === "email" ? "email" : "mobile number"
      }.`,
      mockedOtpDevOnly:
        process.env.NODE_ENV !== "production" ? delivery.otp : undefined,
    });
  }

  // Record device & location if not present
  if (!isDeviceKnown) user.knownDevices.push(device);
  if (!isLocationKnown) user.knownLocations.push({ city: geo.city, state: geo.state });
  await user.save();

  issueSession(res, user);
});

// Theme Preference Sync Endpoint
router.put("/theme", async (req, res) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.JWT_SECRET)
    return res.status(401).json({ error: "Not authenticated." });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "Not authenticated." });

    const { themePreference } = req.body;
    if (["light", "dark", "auto"].includes(themePreference)) {
      user.themePreference = themePreference;
      await user.save();
    }
    return res.json({ success: true, themePreference: user.themePreference, user: publicUser(user) });
  } catch {
    return res.status(401).json({ error: "Not authenticated." });
  }
});

router.get("/me", async (req, res) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.JWT_SECRET)
    return res.status(401).json({ error: "Not authenticated." });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "Not authenticated." });
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(401).json({ error: "Not authenticated." });
  }
});

module.exports = router;
