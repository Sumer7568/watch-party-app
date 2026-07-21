const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET is not configured." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
};
