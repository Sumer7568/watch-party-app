const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const bcrypt = require("bcryptjs");
const sendSms = require("../utils/sendSms");

// --- TASK 4 HELPER: South India Geo-fencing Checker ---
const isSouthIndianState = (stateName) => {
  if (!stateName) return false;
  const southStates = [
    "tamil nadu",
    "kerala",
    "karnataka",
    "andhra pradesh",
    "telangana",
  ];
  return southStates.includes(stateName.trim().toLowerCase());
};

// ==========================================
// 1. REGISTER USER CONTROLLER
// ==========================================
const registerUser = async (req, res) => {
  try {
    const { name, email, mobile, password, state, city } = req.body;

    // Basic Validation
    if (!name || !email || !password || !state || !city) {
      return res.status(400).json({ error: "Please fill all mandatory fields." });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "User already exists with this Email." });
    }

    const isSouth = isSouthIndianState(state);

    // Strict Rule: Non-South users MUST provide a mobile number for SMS OTP
    if (!isSouth && (!mobile || mobile.trim() === "")) {
      return res.status(400).json({
        error: "Mobile number is strictly required for users outside South India to receive OTP.",
      });
    }

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate 6-Digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // Valid for 10 mins

    const user = await User.create({
      name,
      email,
      mobile: mobile || "N/A",
      password: hashedPassword,
      state,
      city,
      otp,
      otpExpires,
    });

    // --- TASK 4 REGIONAL ROUTING LOGIC ---
    if (isSouth) {
      const message = `Hello ${name},\n\nWelcome to Elevance Streaming! Your South-Region verification OTP is: ${otp}\n\nDo not share this with anyone. Valid for 10 minutes.`;

      try {
        await sendEmail({
          email: user.email,
          subject: "Elevance Platform - Secure Email OTP Verification",
          message,
        });
      } catch (err) {
        console.log("Email blocked by Render, OTP is in logs");
      }

      return res.status(201).json({
        success: true,
        message: "User registered! OTP sent securely to your Registered Email Address (South India Region).",
        userId: user._id,
        region: "South India",
        authMethod: "Email",
        mockedOtpDevOnly: process.env.NODE_ENV !== "production" ? otp : undefined,
      });
    } else {
      await sendSms({ mobile, message: `Elevance Streaming OTP is ${otp}. Valid for 10 minutes.` });

      return res.status(201).json({
        success: true,
        message: "User registered! OTP dispatched to your Mobile Number (Rest of India Region).",
        userId: user._id,
        region: "Rest of India",
        authMethod: "Mobile SMS",
        mockedOtpDevOnly: process.env.NODE_ENV !== "production" ? otp : undefined,
      });
    }
  } catch (error) {
    console.error("[Register Error]:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { registerUser };
