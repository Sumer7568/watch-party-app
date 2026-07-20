// Comment Moderation Utility & Middleware
const ABUSIVE_WORDS = [
  "abuse", "hate", "spam", "scam", "idiot", "stupid",
  "fuck", "shit", "bitch", "asshole", "bastard", "crap",
  "dumb", "fool", "loser"
];

// Spam Regex: 5+ consecutive identical characters or 4+ repeated punctuation marks
const REPEATED_CHAR_REGEX = /(.)\1{4,}/i;
const REPEATED_PUNCT_REGEX = /([!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])\1{3,}/;

const moderateComment = (req, res, next) => {
  const text = (req.body?.text || "").trim();

  if (!text) {
    return res.status(400).json({ error: "Comment text cannot be empty." });
  }

  const lower = text.toLowerCase();

  // 1. Abuse Word Filter
  const foundAbuse = ABUSIVE_WORDS.some((word) => lower.includes(word));
  if (foundAbuse) {
    return res.status(400).json({
      error: "Comment rejected: Contains prohibited or abusive language.",
    });
  }

  // 2. Spam Regex Filter
  if (REPEATED_CHAR_REGEX.test(text) || REPEATED_PUNCT_REGEX.test(text)) {
    return res.status(400).json({
      error: "Comment rejected: Spammy content or excessive repeated characters detected.",
    });
  }

  next();
};

// Location Privacy Sanitizer: Strips out exact city and saves State/Region and Country only
const sanitizeLocation = (user = {}, requestBodyLocation = "") => {
  let locationString = requestBodyLocation || "";

  if (!locationString && (user.state || user.city)) {
    locationString = user.state ? `${user.state}, India` : "India";
  }

  // If a full string is passed e.g. "Mumbai, Maharashtra, India", strip out the first segment (city)
  const parts = locationString.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 2) {
    // Keep only State and Country (last two parts)
    return parts.slice(-2).join(", ");
  }

  return parts.join(", ") || "India";
};

module.exports = { moderateComment, sanitizeLocation };
