const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { registerUser } = require("../controllers/authController");
const sendEmail = require("../utils/sendEmail");
const sendSms = require("../utils/sendSms");

const isSouthIndianState = (stateName = "") => ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana"].includes(stateName.trim().toLowerCase());
const createOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, city: user.city, state: user.state, plan: user.plan });
const issueSession = (res, user) => {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  return res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }).json({ success: true, user: publicUser(user) });
};

const sendRegionalOtp = async (user, purpose) => {
  const otp = createOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  if (isSouthIndianState(user.state)) {
    await sendEmail({
      email: user.email,
      subject: `Elevance ${purpose} OTP`,
      message: `Hello ${user.name},\n\nYour Elevance ${purpose.toLowerCase()} OTP is: ${otp}\n\nValid for 10 minutes.`,
    });
    return { channel: "email", region: "South India", otp };
  }

  await sendSms({ mobile: user.mobile, message: `Elevance ${purpose} OTP is ${otp}. Valid for 10 minutes.` });
  return { channel: "mobile", region: "Rest of India", otp };
};

router.post("/register", registerUser);
router.post("/verify", async (req, res) => {
  const user = await User.findOne({ _id: req.body.userId, otp: req.body.otp, otpExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: "Invalid or expired OTP." });
  user.isVerified = true; user.otp = undefined; user.otpExpires = undefined; await user.save();
  issueSession(res, user);
});
router.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password || "", user.password))) return res.status(401).json({ error: "Invalid credentials." });
  const delivery = await sendRegionalOtp(user, "Login");
  res.json({
    success: true,
    otpRequired: true,
    userId: user._id,
    region: delivery.region,
    authMethod: delivery.channel === "email" ? "Email" : "Mobile SMS",
    message: `OTP sent to your registered ${delivery.channel === "email" ? "email address" : "mobile number"}.`,
    mockedOtpDevOnly: process.env.NODE_ENV !== "production" ? delivery.otp : undefined,
  });
});

module.exports = router;
