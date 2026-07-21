const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (token && process.env.JWT_SECRET) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) req.user = user;
    }
  } catch {
    // guest sessions are allowed for watch party routes
  }
  next();
};
