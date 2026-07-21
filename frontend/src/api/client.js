const API_BASE = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

export const api = {
  // Authentication
  getMe: () => request("/auth/me"),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  verifyOtp: (body) => request("/auth/verify", { method: "POST", body: JSON.stringify(body) }),
  verifySecurityOtp: (body) => request("/auth/verify-otp", { method: "POST", body: JSON.stringify(body) }),
  updateThemePreference: (themePreference) =>
    request("/auth/theme", { method: "PUT", body: JSON.stringify({ themePreference }) }),

  // Videos
  getVideos: () => request("/videos"),
  getVideo: async (id) => {
    const videos = await request("/videos");
    return videos.find((video) => video._id === id);
  },

  // Comments
  getComments: (videoId) => request(`/videos/${videoId}/comments`),
  postComment: (videoId, text, location) =>
    request(`/videos/${videoId}/comments`, { method: "POST", body: JSON.stringify({ text, location }) }),
  reactComment: (id, type) =>
    request(`/comments/${id}/react`, { method: "POST", body: JSON.stringify({ type }) }),
  reportComment: (id) =>
    request(`/comments/${id}/report`, { method: "POST" }),
  deleteComment: (id) =>
    request(`/comments/${id}`, { method: "DELETE" }),
  translate: (text, targetLanguage) =>
    request("/translate", { method: "POST", body: JSON.stringify({ text, targetLanguage }) }),

  // Downloads
  downloadVideo: (videoId) => request(`/videos/${videoId}/download`, { method: "POST" }),
  getDownloads: () => request("/downloads"),

  // Watch Time Limits & Regional Preferences
  watch: (seconds) => request("/watch", { method: "POST", body: JSON.stringify({ seconds }) }),
  getExperience: () => request("/experience"),

  // Payments / Upgrades
  createPaymentOrder: (plan) => request("/payments/order", { method: "POST", body: JSON.stringify({ plan }) }),
  verifyPayment: (body) => request("/payments/verify", { method: "POST", body: JSON.stringify(body) }),

  // Watch Parties & Signaling
  createWatchParty: (videoId, peerId) =>
    request("/watch-party", { method: "POST", body: JSON.stringify({ videoId, peerId }) }),
  getWatchParty: (roomCode) => request(`/watch-party/${roomCode}`),
  joinWatchParty: (roomCode, peerId, controls = {}) =>
    request(`/watch-party/${roomCode}/join`, {
      method: "POST",
      body: JSON.stringify({ peerId, ...controls }),
    }),
  leaveWatchParty: (roomCode, peerId) =>
    request(`/watch-party/${roomCode}/leave`, {
      method: "POST",
      body: JSON.stringify({ peerId }),
    }),
  updatePlayback: (roomCode, playback) =>
    request(`/watch-party/${roomCode}/playback`, {
      method: "PATCH",
      body: JSON.stringify(playback),
    }),
  updateParticipant: (roomCode, peerId, controls) =>
    request(`/watch-party/${roomCode}/participant`, {
      method: "PATCH",
      body: JSON.stringify({ peerId, ...controls }),
    }),
  sendSignal: (room, sender, type, payload) =>
    request(`/calls/${room}/signal`, {
      method: "POST",
      body: JSON.stringify({ sender, type, payload }),
    }),
  pollSignals: (room, sender, after) =>
    fetch(`${API_BASE}/calls/${room}/signal?after=${after}&sender=${encodeURIComponent(sender)}`, {
      credentials: "include",
    }).then((res) => res.json()),
};

export function createPeerId() {
  return `peer-${crypto.randomUUID().slice(0, 8)}`;
}
