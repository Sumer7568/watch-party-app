import React, { useState, useEffect, useRef, useCallback } from "react";
import { api, createPeerId } from "./api/client";
import { useSignaling } from "./hooks/useSignaling";
import { useWatchPartyRtc } from "./hooks/useWatchPartyRtc";
import { useSessionRecording } from "./hooks/useSessionRecording";
import CustomVideoPlayer from "./components/CustomVideoPlayer";
import { getAutoThemeIST, resolveTheme } from "./utils/themeManager";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomCode, setRoomCode] = useState(null);
  const [page, setPage] = useState("home"); // "home" | "login" | "register" | "otp" | "watch-party" | "downloads"

  // Auth Forms State
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMobile, setAuthMobile] = useState("");
  const [authCity, setAuthCity] = useState("");
  const [authState, setAuthState] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpUserId, setOtpUserId] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpPrefilled, setOtpPrefilled] = useState("");
  const [authError, setAuthError] = useState("");

  // Platform State
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState("");
  const [shareLocation, setShareLocation] = useState(true);
  const [translatedComments, setTranslatedComments] = useState({});
  const [translatingId, setTranslatingId] = useState(null);
  const [reportingId, setReportingId] = useState(null);
  const [reportedIds, setReportedIds] = useState(new Set());
  const [watchLimitState, setWatchLimitState] = useState({ allowed: true, usedSeconds: 0, limitSeconds: 300 });
  const [userDownloads, setUserDownloads] = useState([]);
  const [theme, setTheme] = useState("dark");
  const [otpChannel, setOtpChannel] = useState("mobile");

  const formatTimeAgo = (dateString) => {
    if (!dateString) return "just now";
    const date = new Date(dateString);
    const now = new Date();
    const diffInSecs = Math.floor((now - date) / 1000);

    if (diffInSecs < 60) return "just now";
    const diffInMins = Math.floor(diffInSecs / 60);
    if (diffInMins < 60) return `${diffInMins}m ago`;
    const diffInHours = Math.floor(diffInMins / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  // Watch Party Active State
  const [partyDetails, setPartyDetails] = useState(null);
  const [peerId] = useState(() => createPeerId());
  const [isHost, setIsHost] = useState(false);
  const [roomInput, setRoomInput] = useState("");

  // Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Video Ref for Synced Playback
  const videoPlayerRef = useRef(null);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const isSyncingRef = useRef(false);

  // Parse URL on init and popstate
  useEffect(() => {
    const checkPath = () => {
      const path = window.location.pathname;
      const match = path.match(/^\/watch-party\/([A-Za-z0-9]+)/i);
      if (match) {
        setRoomCode(match[1].toUpperCase());
        setPage("watch-party");
      } else if (path === "/downloads") {
        setPage("downloads");
      } else {
        setPage("home");
      }
    };
    checkPath();
    window.addEventListener("popstate", checkPath);
    return () => window.removeEventListener("popstate", checkPath);
  }, []);

  // Set URL Helper
  const navigateTo = (path) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new Event("popstate"));
  };

  // Fetch current user on mount
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const data = await api.getMe();
        if (data.user) {
          setUser(data.user);
          // Load regional theme & preferences
          const exp = await api.getExperience();
          setTheme(exp.theme || "dark");
          setOtpChannel(exp.otpChannel || "mobile");
        }
      } catch (err) {
        // Not authenticated
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, []);

  // Apply theme to document (resolves auto theme via IST time)
  useEffect(() => {
    const pref = user?.themePreference || theme;
    const activeTheme = resolveTheme(pref);

    if (activeTheme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      document.documentElement.style.backgroundColor = "#f5f5f4";
      document.documentElement.style.color = "#18181b";
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      document.documentElement.style.backgroundColor = "#111210";
      document.documentElement.style.color = "#f5f5f4";
    }
  }, [user?.themePreference, theme]);

  const handleSetThemePreference = async (pref) => {
    setTheme(pref);
    if (user) {
      try {
        const res = await api.updateThemePreference(pref);
        if (res.user) {
          setUser(res.user);
        }
      } catch (err) {
        console.error("Theme update failed", err);
      }
    }
  };

  // Fetch Videos & Downloads
  useEffect(() => {
    if (user) {
      api.getVideos().then((vids) => {
        const list = Array.isArray(vids) ? vids : (vids?.videos || []);
        setVideos(list);
        if (list.length > 0) {
          setSelectedVideo((prev) => prev || list[0]);
        }
      }).catch(console.error);
      api.getDownloads().then(setUserDownloads).catch(console.error);
    }
  }, [user]);

  // Sync Watch Limits every 10s if video is playing
  useEffect(() => {
    if (!user || !selectedVideo || isPlayingLocal) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.watch(10);
        setWatchLimitState(data);
        if (!data.allowed) {
          videoPlayerRef.current?.pause();
          alert("Daily watch duration limit exceeded. Please upgrade your plan to continue.");
        }
      } catch (err) {
        console.error("Watch limit tracking error:", err);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [user, selectedVideo, isPlayingLocal]);

  // --- WebRTC / SIGNALING ---

  // Chat message listener helper
  const addChatMessage = useCallback((sender, text, name) => {
    setChatMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), sender, text, name, createdAt: new Date().toISOString() }
    ]);
  }, []);

  const onSignalEvent = useCallback(
    async (event) => {
      // Pass WebRTC signals to useWatchPartyRtc hook
      if (rtc.handleSignalEvent) {
        await rtc.handleSignalEvent(event);
      }

      // Handle custom real-time Chat signal
      if (event.type === "chat") {
        addChatMessage(event.sender, event.payload.text, event.payload.name);
      }

      // Handle room participant join/presence/leave events
      if (event.type === "join" || event.type === "presence") {
        if (event.payload?.participants) {
          setPartyDetails((prev) => (prev ? { ...prev, participants: event.payload.participants } : prev));
        } else if (event.payload?.peerId || event.sender) {
          const targetPeerId = event.payload?.peerId || event.sender;
          setPartyDetails((prev) => {
            if (!prev) return prev;
            const existingIdx = prev.participants.findIndex((p) => p.peerId === targetPeerId);
            let nextParticipants;
            if (existingIdx !== -1) {
              nextParticipants = [...prev.participants];
              nextParticipants[existingIdx] = {
                ...nextParticipants[existingIdx],
                name: event.payload?.name || nextParticipants[existingIdx].name || "Guest User",
                muted: event.payload?.muted !== undefined ? event.payload.muted : nextParticipants[existingIdx].muted,
                cameraOff: event.payload?.cameraOff !== undefined ? event.payload.cameraOff : nextParticipants[existingIdx].cameraOff,
              };
            } else {
              nextParticipants = [
                ...prev.participants,
                {
                  peerId: targetPeerId,
                  userId: event.payload?.userId || null,
                  name: event.payload?.name || "Guest User",
                  isHost: Boolean(event.payload?.isHost),
                  muted: Boolean(event.payload?.muted),
                  cameraOff: Boolean(event.payload?.cameraOff),
                },
              ];
            }
            return { ...prev, participants: nextParticipants };
          });
        }
      }

      if (event.type === "leave") {
        if (event.payload?.participants) {
          setPartyDetails((prev) => (prev ? { ...prev, participants: event.payload.participants } : prev));
        } else {
          const leavingPeerId = event.payload?.peerId || event.sender;
          setPartyDetails((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.filter((p) => p.peerId !== leavingPeerId),
            };
          });
        }
      }

      // Handle real-time Synced Playback signal for guests
      if (event.type === "playback" && !isHost) {
        const { isPlaying, currentTime } = event.payload;
        const player = videoPlayerRef.current;
        if (player) {
          isSyncingRef.current = true;
          if (isPlaying && player.paused) {
            player.play().catch(() => {});
          } else if (!isPlaying && !player.paused) {
            player.pause();
          }
          if (Math.abs(player.currentTime - currentTime) > 1.5) {
            player.currentTime = currentTime;
          }
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 100);
        }
      }
    },
    [isHost, addChatMessage]
  );

  const { send: sendSignal } = useSignaling(roomCode, peerId, onSignalEvent);
  const rtc = useWatchPartyRtc(roomCode, peerId, sendSignal);

  // Setup Watch Party Session and Fetch details
  useEffect(() => {
    if (!roomCode || !user) return;

    let active = true;
    const loadParty = async () => {
      try {
        let details;
        try {
          const joinRes = await api.joinWatchParty(roomCode, peerId, { displayName: user.name });
          details = joinRes.party || (await api.getWatchParty(roomCode));
          if (joinRes.participants) {
            details.participants = joinRes.participants;
          }
        } catch {
          details = await api.getWatchParty(roomCode);
        }

        if (!active) return;
        setPartyDetails(details);
        if (details.video) setSelectedVideo(details.video);
        setIsHost(details.hostPeerId === peerId || (details.host && (details.host._id === user.id || details.host === user.id)));

        // Load chat history
        if (details.chatHistory) {
          const formatted = details.chatHistory.map((c) => ({
            id: c.id,
            sender: c.sender,
            text: c.text,
            name: c.name || "Peer",
            createdAt: c.createdAt || new Date().toISOString()
          }));
          setChatMessages(formatted);
        }

        // Initialize WebRTC media streams
        await rtc.startLocalMedia();
        await rtc.announcePresence();
      } catch (err) {
        alert("Failed to join watch party: " + err.message);
        navigateTo("/");
      }
    };

    loadParty();
    const interval = setInterval(loadParty, 4000); // regular sync fallback

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [roomCode, user]);

  // Host broadcasts playback status shifts
  const onLocalPlaybackChange = useCallback(() => {
    if (!isHost || !videoPlayerRef.current || isSyncingRef.current) return;
    const player = videoPlayerRef.current;
    const isPlaying = !player.paused;
    const currentTime = player.currentTime;

    // Save to Database
    api.updatePlayback(roomCode, { isPlaying, currentTime, peerId }).catch(console.error);

    // Real-time broadcast signal
    sendSignal("playback", { isPlaying, currentTime, sender: peerId });
  }, [isHost, roomCode, peerId, sendSignal]);

  // Host Session Recording
  const recorder = useSessionRecording(isHost);

  // Send Chat message
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomCode) return;
    const text = chatInput.trim();
    setChatInput("");

    // Send chat message signal
    await sendSignal("chat", { text, name: user.name });
    addChatMessage(peerId, text, user.name);
  };

  // Leave Watch Party Call
  const handleLeaveParty = async () => {
    if (roomCode) {
      await api.leaveWatchParty(roomCode, peerId);
      await rtc.leaveCall();
      setRoomCode(null);
      setPartyDetails(null);
      navigateTo("/");
    }
  };

  // Playback Gestures Overlay & controls
  const lastTapRef = useRef(0);
  const handleVideoTap = (e) => {
    const now = Date.now();
    const delay = now - lastTapRef.current;
    const video = videoPlayerRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; // relative click coordinate
    const width = rect.width;

    if (delay < 350) {
      // Double tap or Triple tap
      if (delay < 150) {
        // Triple Tap
        if (x > (width * 2) / 3) {
          // Right side triple tap
          alert("A website cannot close a tab that it did not open. Browser security prevents tab closure.");
        }
      } else {
        // Double Tap
        if (x < width / 3) {
          // Seek back 10s
          video.currentTime = Math.max(0, video.currentTime - 10);
        } else if (x > (width * 2) / 3) {
          // Seek forward 10s
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        }
      }
    } else {
      // Single tap center play/pause
      if (x >= width / 3 && x <= (width * 2) / 3) {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }
    lastTapRef.current = now;
  };

  // --- COMMENTS HANDLERS ---
  const loadComments = async (videoId) => {
    try {
      const data = await api.getComments(videoId);
      setComments(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedVideo && page === "home") {
      loadComments(selectedVideo._id);
    }
  }, [selectedVideo, page]);

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentError("");
    try {
      const locStr = shareLocation && user ? (user.state ? `${user.state}, India` : "India") : "";
      const newComment = await api.postComment(selectedVideo._id, commentText, locStr);
      setComments((prev) => [newComment, ...prev]);
      setCommentText("");
    } catch (err) {
      setCommentError(err.message);
    }
  };

  const handleReactComment = async (id, type) => {
    try {
      const res = await api.reactComment(id, type);
      setComments((prev) => prev.map((c) => (c._id === id ? res : c)));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReportComment = async (id) => {
    try {
      setReportingId(id);
      const res = await api.reportComment(id);
      if (res.comment) {
        setComments((prev) => prev.map((c) => (c._id === id ? res.comment : c)));
      }
      setReportedIds((prev) => new Set(prev).add(id));
    } catch (err) {
      alert(err.message);
    } finally {
      setReportingId(null);
    }
  };

  const handleDeleteComment = async (id) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      await api.deleteComment(id);
      setComments((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleTranslateToggle = async (commentId, originalText) => {
    if (translatedComments[commentId]) {
      setTranslatedComments((prev) => {
        const copy = { ...prev };
        delete copy[commentId];
        return copy;
      });
      return;
    }

    try {
      setTranslatingId(commentId);
      const res = await api.translate(originalText, "en");
      setTranslatedComments((prev) => ({
        ...prev,
        [commentId]: res.translatedText || `[EN Translation] ${originalText}`,
      }));
    } catch {
      setTranslatedComments((prev) => ({
        ...prev,
        [commentId]: `[EN Translation] ${originalText}`,
      }));
    } finally {
      setTranslatingId(null);
    }
  };

  // --- DOWNLOADS & PAYMENTS ---
  const handleDownload = async (videoId) => {
    try {
      const res = await api.downloadVideo(videoId);
      window.open(res.downloadUrl, "_blank");
      // Update local downloads
      const updated = await api.getDownloads();
      setUserDownloads(updated);
    } catch (err) {
      if (err.message.includes("limit") || err.message.includes("Daily free")) {
        alert("Daily download quota reached. Upgrading plan offers unlimited downloads!");
      } else {
        alert(err.message);
      }
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpgradePlan = async (plan) => {
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      alert("Razorpay SDK failed to load. Please check your internet connection.");
      return;
    }
    try {
      const data = await api.createPaymentOrder(plan);
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || data.key,
        amount: data.order.amount,
        currency: data.order.currency,
        name: "Elevance Premium",
        description: `Upgrade to ${plan} Plan`,
        order_id: data.order.id,
        handler: async (response) => {
          try {
            const verify = await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan
            });
            if (verify.success) {
              const me = await api.getMe();
              setUser(me.user);
              alert(`Successfully upgraded to ${plan} Plan! Invoice details updated.`);
            }
          } catch (verifyErr) {
            alert("Verification failed: " + verifyErr.message);
          }
        },
        prefill: { name: user.name, email: user.email }
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      alert("Upgrade failed: " + err.message);
    }
  };

  // --- AUTH PORTALS ---
  const handleDemoLogin = async () => {
    const demoEmail = `demo_${Math.random().toString(36).substring(2, 8)}@elevance.io`;
    setAuthError("");
    try {
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Demo Reviewer",
          email: demoEmail,
          password: "password123",
          state: "Tamil Nadu",
          city: "Chennai",
          mobile: "9988776655"
        })
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error || "Registration failed.");

      // Direct validation
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: regData.userId,
          otp: regData.mockedOtpDevOnly || "123456"
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "OTP verification failed.");

      setUser(verifyData.user);
      setPage("home");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const data = await api.login({ email: authEmail, password: authPassword });
      if (data.otpRequired) {
        setOtpUserId(data.userId);
        setOtpRequired(true);
        setOtpValue("");
        if (data.mockedOtpDevOnly) {
          setOtpPrefilled(data.mockedOtpDevOnly);
        }
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const data = await api.register({
        name: authName,
        email: authEmail,
        password: authPassword,
        mobile: authMobile,
        state: authState,
        city: authCity
      });
      if (data.success) {
        setOtpUserId(data.userId);
        setOtpRequired(true);
        setOtpValue("");
        if (data.mockedOtpDevOnly) {
          setOtpPrefilled(data.mockedOtpDevOnly);
        }
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      let data;
      try {
        data = await api.verifySecurityOtp({ userId: otpUserId, tempToken: otpUserId, otp: otpValue });
      } catch {
        data = await api.verifyOtp({ userId: otpUserId, otp: otpValue });
      }
      if (data.success) {
        setUser(data.user);
        setPage("home");
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = async () => {
    // Basic logout logic: reset user states & cookie tokens
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setUser(null);
    setPage("home");
  };

  const getNextVideo = () => {
    if (!selectedVideo || videos.length === 0) return null;
    const idx = videos.findIndex(v => v._id === selectedVideo._id);
    if (idx !== -1 && idx < videos.length - 1) {
      return videos[idx + 1];
    }
    return null;
  };
  const nextVideo = getNextVideo();
  const hasNextVideo = !!nextVideo;

  const handleNextVideo = () => {
    if (nextVideo) {
      setSelectedVideo(nextVideo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCreateParty = async (videoId) => {
    if (user.plan === "Free") {
      alert("Hosting a Watch Party is a premium feature. Please upgrade to a Bronze, Silver, or Gold plan in the sidebar to stream together with friends!");
      return;
    }
    try {
      const res = await api.createWatchParty(videoId, peerId);
      navigateTo(`/watch-party/${res.roomCode}`);
    } catch (err) {
      alert("Error starting Watch Party: " + err.message);
    }
  };

  const handleJoinPartyByCode = (e) => {
    e.preventDefault();
    if (!roomInput.trim()) return;
    navigateTo(`/watch-party/${roomInput.trim().toUpperCase()}`);
  };

  // --- RENDERING VIEWS ---

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#111210]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-zinc-400 font-medium">Entering Elevance...</p>
        </div>
      </div>
    );
  }

  // Auth Portals Layout
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-900 dark:bg-[#111210] dark:text-[#f5f5f4] p-4 sm:p-6 transition-colors duration-200">
        <div className="w-full max-w-md bg-white border border-stone-200 dark:bg-zinc-900/60 backdrop-blur-md dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 bg-clip-text text-transparent">
              Elevance
            </h1>
            <p className="text-stone-500 dark:text-zinc-400 text-xs sm:text-sm mt-1.5">Social Synced Video Streaming Experience</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-900/40 border border-red-800 text-red-300 rounded-lg text-xs sm:text-sm text-center">
              {authError}
            </div>
          )}

          {otpRequired ? (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">
                  Enter Verification OTP
                </label>
                <input
                  type="text"
                  name="otp"
                  autoComplete="one-time-code"
                  required
                  placeholder="6-digit code"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 text-stone-900 dark:bg-zinc-950 dark:border-zinc-800 dark:text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition"
                />
                {otpPrefilled && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Prefilled sandbox OTP: <span className="font-bold text-emerald-400">{otpPrefilled}</span>
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-3 rounded-xl shadow-lg transition"
              >
                Verify & Log In
              </button>
            </form>
          ) : page === "register" ? (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Robin Hood"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="robin@elevance.io"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">Mobile Phone</label>
                <input
                  type="text"
                  placeholder="+91..."
                  value={authMobile}
                  onChange={(e) => setAuthMobile(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">City</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bangalore"
                    value={authCity}
                    onChange={(e) => setAuthCity(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">State</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Karnataka"
                    value={authState}
                    onChange={(e) => setAuthState(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 chars"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-3 rounded-xl shadow-lg transition"
              >
                Sign Up & Send OTP
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@email.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-3 rounded-xl shadow-lg transition"
              >
                Log In
              </button>
            </form>
          )}

          {!otpRequired && (
            <div className="mt-6 text-center text-sm text-zinc-500">
              {page === "register" ? (
                <p>
                  Already have an account?{" "}
                  <button onClick={() => setPage("login")} className="text-emerald-400 font-semibold hover:underline">
                    Log In
                  </button>
                </p>
              ) : (
                <p>
                  Don't have an account?{" "}
                  <button onClick={() => setPage("register")} className="text-emerald-400 font-semibold hover:underline">
                    Sign Up
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs font-semibold uppercase">
              <span className="bg-[#111210] px-3 text-zinc-500">Or Bypass Credentials</span>
            </div>
          </div>

          <button
            onClick={handleDemoLogin}
            className="w-full bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold py-3 rounded-xl shadow transition"
          >
            Continue with submission demo
          </button>
        </div>
      </div>
    );
  }

  // --- WATCH PARTY ROOM VIEW ---
  if (page === "watch-party" && roomCode) {
    return (
      <div className="min-h-screen flex flex-col bg-[#111210] text-[#f5f5f4] selection:bg-emerald-500/30">
        {/* Navbar */}
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 sticky top-0 z-50">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button onClick={handleLeaveParty} className="text-zinc-400 hover:text-white transition">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 className="text-base sm:text-xl font-bold tracking-wide">
              Watch Party: <span className="text-emerald-400 font-black">{roomCode}</span>
            </h2>
          </div>
          <div className="flex items-center space-x-2.5 sm:space-x-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Room link copied to clipboard!");
              }}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl text-xs sm:text-sm transition"
            >
              Copy Invite Link
            </button>
            {isHost && (
              <div className="flex items-center space-x-2">
                {recorder.recording ? (
                  <button
                    onClick={recorder.stopRecording}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs sm:text-sm animate-pulse transition"
                  >
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={() => recorder.startRecording(videoPlayerRef.current, rtc.localStream)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs sm:text-sm transition"
                  >
                    Record Session
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Saved recordings modal panel for host */}
        {isHost && recorder.recordings.length > 0 && (
          <div className="bg-zinc-900 border-b border-zinc-800 p-4 px-6 flex flex-col space-y-2">
            <h3 className="text-xs font-bold uppercase text-zinc-400">Your Local Recordings</h3>
            <div className="flex flex-wrap gap-4">
              {recorder.recordings.map((rec) => (
                <div key={rec.id} className="flex items-center space-x-3 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                  <span className="text-xs text-zinc-300">Session {rec.id}</span>
                  <a
                    href={rec.url}
                    download={`elevance-recording-${rec.id}.webm`}
                    className="text-xs font-bold text-emerald-400 hover:underline"
                  >
                    Download WebM
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
          {/* Main Stage (Synced Player) */}
          <div className="lg:col-span-3 flex flex-col p-6 space-y-4">
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 group">
              <video
                ref={videoPlayerRef}
                src={selectedVideo?.sourceUrl}
                className="w-full h-full object-contain"
                onPlay={onLocalPlaybackChange}
                onPause={onLocalPlaybackChange}
                onSeeked={onLocalPlaybackChange}
                controls={isHost}
              />
              {/* Playback Gestures Overlay */}
              <div
                onClick={handleVideoTap}
                className="absolute inset-0 cursor-pointer bg-transparent select-none z-10"
              />
              {/* Host indicator */}
              <div className="absolute top-4 left-4 bg-zinc-900/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold border border-zinc-700 shadow-md z-20">
                Playing: {selectedVideo?.title}
              </div>
            </div>

            {/* Video Call participant streams */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-2">
              {/* Local Stream */}
              <div className="aspect-video bg-zinc-950 rounded-xl overflow-hidden relative border border-zinc-800">
                {rtc.localStream && !rtc.cameraOff ? (
                  <video
                    ref={(el) => {
                      if (el && rtc.localStream) el.srcObject = rtc.localStream;
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                    <span className="text-zinc-500 text-xs font-bold">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] font-bold">
                  {user.name} (You) {rtc.muted && "🔇"}
                </div>
              </div>

              {/* Remote Participants Streams */}
              {partyDetails?.participants
                ?.filter((p) => p.peerId !== peerId)
                .map((p) => {
                  const stream = rtc.remoteStreams[p.peerId];
                  const isRemoteMuted = p.muted;
                  const isRemoteCameraOff = p.cameraOff || !stream;

                  return (
                    <div key={p.peerId} className="aspect-video bg-zinc-950 rounded-xl overflow-hidden relative border border-zinc-800">
                      {stream && !p.cameraOff ? (
                        <video
                          ref={(el) => {
                            if (el && el.srcObject !== stream) {
                              el.srcObject = stream;
                            }
                          }}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 text-center p-2">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center mb-1 text-sm border border-emerald-500/30">
                            {p.name?.charAt(0).toUpperCase() || "G"}
                          </div>
                          <span className="text-zinc-400 text-[11px] font-semibold">{p.name || "Guest User"}</span>
                          <span className="text-zinc-600 text-[9px]">Camera Off</span>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] font-bold text-white flex items-center space-x-1">
                        <span>{p.name || "Guest User"}</span>
                        {isRemoteMuted && <span className="text-red-400">🔇</span>}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Video Call Controls */}
            <div className="flex items-center justify-center space-x-4 py-2">
              <button
                onClick={rtc.toggleMute}
                className={`p-3 rounded-full border transition ${
                  rtc.muted ? "bg-red-600 border-red-700 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {rtc.muted ? "Unmute Mic" : "Mute Mic"}
              </button>
              <button
                onClick={rtc.toggleCamera}
                className={`p-3 rounded-full border transition ${
                  rtc.cameraOff ? "bg-red-600 border-red-700 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                }`}
                disabled={rtc.screenSharing}
              >
                {rtc.cameraOff ? "Camera On" : "Camera Off"}
              </button>
              {rtc.screenSharing ? (
                <button
                  onClick={rtc.stopScreenShare}
                  className="p-3 rounded-full bg-orange-600 border border-orange-700 text-white hover:bg-orange-500 transition"
                >
                  Stop Screen Share
                </button>
              ) : (
                <button
                  onClick={rtc.startScreenShare}
                  className="p-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Share Screen
                </button>
              )}
              <button
                onClick={handleLeaveParty}
                className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold transition shadow-lg"
              >
                Leave Party
              </button>
            </div>
          </div>

          {/* Sidebar (Chat & Participants List) */}
          <div className="lg:col-span-1 border-l border-zinc-800 flex flex-col bg-zinc-950/80">
            {/* Header info */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/20">
              <h3 className="text-sm font-black tracking-wide text-zinc-300">Room Participants</h3>
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {partyDetails?.participants?.map((p) => (
                  <div key={p.peerId} className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-zinc-900">
                    <span className="font-semibold text-zinc-300">
                      {p.name} {p.isHost && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 rounded-full">Host</span>}
                    </span>
                    <span className="text-zinc-500 font-medium">
                      {p.muted ? "🔇" : "🎙️"} {p.cameraOff ? "❌" : "📷"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat Box */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/20 flex items-center justify-between">
                <h3 className="text-sm font-black tracking-wide text-zinc-300">Live Chat</h3>
              </div>

              {/* Chat Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-xs font-bold text-emerald-400">{msg.name}</span>
                      <span className="text-[9px] text-zinc-500">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-1 bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-850 self-start">
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Chat Form */}
              <form onSubmit={handleSendChat} className="p-4 border-t border-zinc-800 flex space-x-2 bg-zinc-900/30">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- DOWNLOADS DIRECTORY VIEW ---
  if (page === "downloads") {
    const getUniqueVideos = () => {
      const unique = [];
      const seen = new Set();
      for (const item of userDownloads) {
        if (item.video && !seen.has(item.video._id)) {
          seen.add(item.video._id);
          unique.push(item.video);
        }
      }
      return unique;
    };
    const uniqueVideos = getUniqueVideos();
    
    const todayStr = new Date().toLocaleDateString("en-CA");
    const downloadsTodayCount = userDownloads.filter(item => {
      if (!item.downloadedAt) return false;
      return new Date(item.downloadedAt).toLocaleDateString("en-CA") === todayStr;
    }).length;

    const DOWNLOAD_LIMITS_DISPLAY = { Free: 1, Bronze: 3, Silver: 5, Gold: "Unlimited" };
    const activeLimit = DOWNLOAD_LIMITS_DISPLAY[user.plan] || 1;

    return (
      <div className="min-h-screen bg-[#111210] text-[#f5f5f4] selection:bg-emerald-500/30">
        {/* Navbar */}
        <nav className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <h1 onClick={() => navigateTo("/")} className="text-2xl font-black tracking-tight cursor-pointer bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
            Elevance
          </h1>
          <div className="flex items-center space-x-6">
            <button onClick={() => navigateTo("/")} className="text-sm font-semibold hover:underline">Dashboard</button>
            <button onClick={handleLogout} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-sm transition">
              Log Out
            </button>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto p-6 lg:p-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
            <div>
              <h2 className="text-3xl font-black">User Profile & Downloads</h2>
              <p className="text-zinc-400 text-sm mt-1">Manage your account tier, download activity history, and quotas.</p>
            </div>
            <button
              onClick={() => navigateTo("/")}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-sm transition self-start md:self-auto"
            >
              Back to Dashboard
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 1 Column: Profile & Quota Stats Card */}
            <div className="space-y-6">
              {/* Profile Details Card */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-xl">
                <div className="flex items-center space-x-4">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-emerald-400 to-teal-600 flex items-center justify-center font-black text-xl text-white shadow-md">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{user.name}</h3>
                    <p className="text-zinc-400 text-xs mt-0.5">{user.email}</p>
                  </div>
                </div>

                <div className="border-t border-zinc-850 pt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Membership Tier:</span>
                    <span className="font-bold text-emerald-400">{user.plan}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Location:</span>
                    <span className="font-semibold text-zinc-300">{user.city}, {user.state}</span>
                  </div>
                </div>
              </div>

              {/* Download Statistics Card */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-xl">
                <h4 className="text-lg font-black border-b border-zinc-850 pb-2">Download Quotas</h4>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-zinc-400 mb-1">
                      <span>Daily Downloads Used</span>
                      <span>{downloadsTodayCount} / {activeLimit}</span>
                    </div>
                    {typeof activeLimit === "number" ? (
                      <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-850">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (downloadsTodayCount / activeLimit) * 100)}%` }}
                        ></div>
                      </div>
                    ) : (
                      <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-850">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full w-full"></div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-zinc-850 pt-4">
                    <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-850 text-center">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase">Today's Total</p>
                      <p className="text-xl font-black text-white mt-1">{downloadsTodayCount}</p>
                    </div>
                    <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-850 text-center">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase">Lifetime Downloads</p>
                      <p className="text-xl font-black text-white mt-1">{userDownloads.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 2 Columns: Saved Offline Videos & Log */}
            <div className="lg:col-span-2 space-y-8">
              {/* Unique Downloaded Videos Section */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6">
                <h3 className="text-xl font-black">Saved Videos ({uniqueVideos.length})</h3>
                {uniqueVideos.length === 0 ? (
                  <div className="bg-zinc-950/50 border border-zinc-855 rounded-2xl p-12 text-center text-zinc-400">
                    No downloaded videos saved on your profile yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {uniqueVideos.map((video) => (
                      <div key={video._id} className="bg-zinc-950/50 border border-zinc-855 rounded-2xl overflow-hidden p-4 flex space-x-4 hover:border-zinc-700 transition">
                        <img src={video.thumbnailUrl} alt={video.title} className="w-20 h-20 object-cover rounded-xl border border-zinc-800" />
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <h4 className="font-bold text-base truncate text-white">{video.title}</h4>
                            <p className="text-zinc-500 text-xs mt-0.5">{video.category} • {Math.floor(video.durationSeconds / 60)}m</p>
                          </div>
                          <a
                            href={video.sourceUrl}
                            download
                            className="text-xs font-black text-emerald-400 hover:underline inline-block mt-2 self-start"
                          >
                            Open Video Stream
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Historical Log Activity Table */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
                <h3 className="text-xl font-black">Detailed Download Activity Logs</h3>
                {userDownloads.length === 0 ? (
                  <p className="text-sm text-zinc-500">No logs recorded.</p>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-zinc-850">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-zinc-950 text-zinc-400 font-semibold border-b border-zinc-850">
                          <th className="p-4">Timestamp</th>
                          <th className="p-4">Video Title</th>
                          <th className="p-4">Active Plan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850 bg-zinc-950/20">
                        {userDownloads.map((item, index) => (
                          <tr key={index} className="hover:bg-zinc-900/40 transition">
                            <td className="p-4 text-xs font-mono text-zinc-400">
                              {new Date(item.downloadedAt).toLocaleString()}
                            </td>
                            <td className="p-4 font-semibold text-zinc-200">
                              {item.video?.title || "Deleted Video"}
                            </td>
                            <td className="p-4 text-xs font-bold text-emerald-400">
                              {item.plan}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Billing & Payment History Card */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4 text-left">
                <h3 className="text-xl font-black">Billing & Payment History</h3>
                {!user.paymentHistory || user.paymentHistory.length === 0 ? (
                  <p className="text-sm text-zinc-500">No payment transactions recorded.</p>
                ) : (
                  <div className="space-y-4">
                    {user.paymentHistory.map((invoice, index) => (
                      <div key={index} className="bg-zinc-950/60 p-5 rounded-2xl border border-zinc-850 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-white">{invoice.invoiceId}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 rounded-full">Paid</span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-zinc-400">
                            <p>Plan Purchased: <strong className="text-zinc-200">{invoice.plan}</strong></p>
                            <p>Transaction ID: <span className="font-mono text-zinc-500">{invoice.paymentId}</span></p>
                            <p>Date: <span>{new Date(invoice.paidAt).toLocaleString()}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 self-end md:self-auto">
                          <span className="text-lg font-black text-emerald-400">₹{invoice.amount}</span>
                          <button
                            onClick={() => {
                              const printWindow = window.open("", "_blank");
                              printWindow.document.write(`
                                <html>
                                  <head>
                                    <title>Invoice - ${invoice.invoiceId}</title>
                                    <style>
                                      body { font-family: system-ui; padding: 40px; color: #111; }
                                      .invoice-box { max-w: 600px; margin: auto; border: 1px solid #eee; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.05); }
                                      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }
                                      .logo { font-size: 24px; font-weight: 800; color: #10b981; }
                                      .title { font-size: 20px; font-weight: 700; text-align: right; }
                                      .details { margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
                                      .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                      .table th, .table td { border-bottom: 1px solid #eee; padding: 12px; text-align: left; }
                                      .table th { background: #f9f9f9; }
                                      .total { text-align: right; font-size: 18px; font-weight: 800; margin-top: 20px; color: #10b981; }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="invoice-box">
                                      <table style="width:100%">
                                        <tr>
                                          <td class="logo">Elevance Streaming</td>
                                          <td class="title" style="text-align:right">INVOICE</td>
                                        </tr>
                                      </table>
                                      <hr/>
                                      <div class="details">
                                        <p><strong>Invoice ID:</strong> ${invoice.invoiceId}</p>
                                        <p><strong>Date:</strong> ${new Date(invoice.paidAt).toLocaleString()}</p>
                                        <p><strong>Customer Email:</strong> ${user.email}</p>
                                        <p><strong>Payment Transaction ID:</strong> ${invoice.paymentId}</p>
                                      </div>
                                      <table class="table">
                                        <thead>
                                          <tr>
                                            <th>Description</th>
                                            <th>Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          <tr>
                                            <td>Elevance ${invoice.plan} Subscription (1 Month)</td>
                                            <td>₹${invoice.amount}.00</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                      <p class="total">Total Paid: ₹${invoice.amount}.00</p>
                                      <button onclick="window.print()" style="margin-top:20px; padding:10px 20px; background:#10b981; border:none; color:white; font-weight:bold; border-radius:5px; cursor:pointer;">Print Page</button>
                                    </div>
                                  </body>
                                </html>
                              `);
                              printWindow.document.close();
                            }}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs transition"
                          >
                            Print Invoice
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- HOME / DASHBOARD VIEW ---
  console.log("Selected Video Data:", selectedVideo);
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 dark:bg-[#111210] dark:text-[#f5f5f4] selection:bg-emerald-500/30 transition-colors duration-200">
      {/* Navbar */}
      <nav className="border-b border-stone-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0 sticky top-0 z-50">
        <h1 onClick={() => { setSelectedVideo(null); navigateTo("/"); }} className="text-xl sm:text-2xl font-black tracking-tight cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 bg-clip-text text-transparent">
          Elevance
        </h1>
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5 sm:gap-4">
          {/* Theme Selector Pill */}
          <div className="flex items-center space-x-1 bg-stone-200 border-stone-300 dark:bg-zinc-900 p-1 rounded-xl dark:border-zinc-800 text-[11px] sm:text-xs">
            <button
              onClick={() => handleSetThemePreference("auto")}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-bold transition ${
                (user?.themePreference || theme) === "auto"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
              title="Auto Theme (Light 10 AM-12 PM IST, Dark otherwise)"
            >
              ⚡ Auto
            </button>
            <button
              onClick={() => handleSetThemePreference("dark")}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-bold transition ${
                (user?.themePreference || theme) === "dark"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              🌙 Dark
            </button>
            <button
              onClick={() => handleSetThemePreference("light")}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-bold transition ${
                (user?.themePreference || theme) === "light"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              ☀️ Light
            </button>
          </div>

          <button onClick={() => navigateTo("/downloads")} className="text-xs sm:text-sm font-semibold hover:underline px-1 text-stone-700 dark:text-stone-200">Downloads</button>
          <div className="flex items-center space-x-1.5 bg-stone-200 border-stone-300 dark:bg-zinc-900 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl dark:border-zinc-800 text-[11px] sm:text-xs">
            <span className="font-semibold text-stone-600 dark:text-zinc-400">Plan:</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400">{user.plan}</span>
          </div>
          <button onClick={handleLogout} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs sm:text-sm transition">
            Log Out
          </button>
        </div>
      </nav>

      {/* Main Grid Layout */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8">
        {/* Left 2 Columns: Video Listing and Player */}
        <div className="lg:col-span-2 space-y-6 sm:space-y-8">
          {/* Active Synced Video Player Box */}
          {selectedVideo ? (
            <div className="bg-white border-stone-200 dark:bg-zinc-900/40 border dark:border-zinc-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">
              <CustomVideoPlayer
                selectedVideo={selectedVideo}
                src={selectedVideo?.sourceUrl || selectedVideo?.videoUrl || selectedVideo?.url || selectedVideo?.source || selectedVideo?.link || ""}
                url={selectedVideo?.sourceUrl || selectedVideo?.videoUrl || selectedVideo?.url || selectedVideo?.source || selectedVideo?.link || ""}
                videoUrl={selectedVideo?.sourceUrl || selectedVideo?.videoUrl || selectedVideo?.url || selectedVideo?.source || selectedVideo?.link || ""}
                sourceUrl={selectedVideo?.sourceUrl || selectedVideo?.videoUrl || selectedVideo?.url || selectedVideo?.source || selectedVideo?.link || ""}
                title={selectedVideo.title}
                isPremium={selectedVideo.isPremium}
                isFreeUser={user.plan === "Free"}
                onNext={handleNextVideo}
                hasNext={hasNextVideo}
                videoRef={videoPlayerRef}
                onUpgrade={handleUpgradePlan}
              />

              {/* Sponsored Ad Banner for Free tier */}
              {user.plan === "Free" && (
                <div className="bg-zinc-950/60 border border-zinc-850 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 text-xs px-4">
                  <span className="text-zinc-400 font-medium text-center sm:text-left">
                    📢 <strong className="text-zinc-300">Sponsored Ad:</strong> Stream ad-free by upgrading your plan.
                  </span>
                  <button
                    onClick={() => handleUpgradePlan("Bronze")}
                    className="text-emerald-400 hover:underline font-black shrink-0"
                  >
                    Remove Ads
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black">{selectedVideo.title}</h2>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">{selectedVideo.description}</p>
                </div>
                <button
                  onClick={() => handleCreateParty(selectedVideo._id)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-lg shadow-emerald-950/20 shrink-0"
                >
                  Start Watch Party
                </button>
              </div>

              {/* Comments Moderation & Discussion Segment */}
              <div className="border-t border-stone-200 dark:border-zinc-850 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-stone-900 dark:text-white">Community Discussion</h3>
                  <span className="text-xs text-stone-500 dark:text-zinc-400 font-semibold">{comments.length} comments</span>
                </div>

                {commentError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-xs sm:text-sm font-semibold">
                    ⚠️ {commentError}
                  </div>
                )}

                <form onSubmit={handlePostComment} className="space-y-3">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      required
                      placeholder="Share your thoughts... (Spam & abuse filters active)"
                      value={commentText}
                      onChange={(e) => { setCommentText(e.target.value); setCommentError(""); }}
                      className="flex-1 bg-stone-50 border border-stone-300 text-stone-900 dark:bg-zinc-950 dark:border-zinc-850 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition"
                    />
                    <button
                      type="submit"
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition shrink-0"
                    >
                      Post
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-stone-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      id="shareLoc"
                      checked={shareLocation}
                      onChange={(e) => setShareLocation(e.target.checked)}
                      className="rounded border-stone-300 dark:border-zinc-800 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="shareLoc" className="cursor-pointer select-none">
                      Attach generalized region for privacy (e.g. <span className="font-semibold">{user?.state || "State"}, India</span>)
                    </label>
                  </div>
                </form>

                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  {comments.length === 0 ? (
                    <p className="text-xs text-stone-500 dark:text-zinc-500 italic py-4 text-center">Be the first to share your thoughts on this stream!</p>
                  ) : (
                    comments.map((comment) => {
                      const isLiked = comment.likes?.some((id) => (typeof id === "object" ? id._id === user?.id : id === user?.id));
                      const isDisliked = comment.dislikes?.some((id) => (typeof id === "object" ? id._id === user?.id : id === user?.id));
                      const isReported = comment.reports?.some((id) => (typeof id === "object" ? id._id === user?.id : id === user?.id)) || reportedIds.has(comment._id);

                      const commentAuthorId = typeof comment.user === "object" ? comment.user?._id || comment.user?.id : comment.user;
                      const isOwnComment = user && (commentAuthorId === user.id || commentAuthorId === user._id || user.role === "admin");

                      return (
                        <div key={comment._id} className="bg-stone-50 border border-stone-200 dark:bg-zinc-950/50 dark:border-zinc-850 p-4 rounded-xl flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{comment.user?.name || "Anonymous User"}</span>
                                <span className="text-[10px] text-stone-500 dark:text-zinc-500 font-semibold">• {formatTimeAgo(comment.createdAt)}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                {(comment.location || comment.city) && (
                                  <span className="text-[10px] px-2 py-0.5 bg-stone-200 dark:bg-zinc-900 border border-stone-300 dark:border-zinc-800 text-stone-600 dark:text-zinc-400 font-bold rounded-full">
                                    📍 {comment.location || `${comment.city}, India`}
                                  </span>
                                )}
                                {comment.isFlagged && (
                                  <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold rounded-full">
                                    ⚠️ Under Review
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-sm text-stone-800 dark:text-zinc-200 mt-2.5 leading-relaxed">
                              {translatedComments[comment._id] ? (
                                <span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs mr-1.5">[Translated]:</span>
                                  {translatedComments[comment._id]}
                                </span>
                              ) : (
                                comment.text
                              )}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-stone-200 dark:border-zinc-900/60 text-xs">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => handleReactComment(comment._id, "like")}
                                className={`flex items-center space-x-1 px-2 py-1 rounded-lg transition ${
                                  isLiked
                                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold"
                                    : "text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white"
                                }`}
                              >
                                <span>👍</span>
                                <span>{comment.likes?.length || 0}</span>
                              </button>
                              <button
                                onClick={() => handleReactComment(comment._id, "dislike")}
                                className={`flex items-center space-x-1 px-2 py-1 rounded-lg transition ${
                                  isDisliked
                                    ? "bg-red-500/20 text-red-600 dark:text-red-400 font-bold"
                                    : "text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white"
                                }`}
                              >
                                <span>👎</span>
                                <span>{comment.dislikes?.length || 0}</span>
                              </button>
                            </div>

                            <div className="flex items-center space-x-3">
                              {isOwnComment && (
                                <button
                                  onClick={() => handleDeleteComment(comment._id)}
                                  className="text-[11px] font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition"
                                  title="Delete your comment"
                                >
                                  🗑️ Delete
                                </button>
                              )}
                              <button
                                onClick={() => handleReportComment(comment._id)}
                                disabled={isReported || reportingId === comment._id}
                                className={`text-[11px] font-semibold transition ${
                                  isReported
                                    ? "text-amber-600 dark:text-amber-400 font-bold cursor-not-allowed"
                                    : "text-stone-400 hover:text-amber-500 dark:text-zinc-500 dark:hover:text-amber-400"
                                }`}
                              >
                                {reportingId === comment._id ? "Reporting..." : isReported ? `⚠️ Reported (${comment.reportCount || 1})` : "🚩 Report"}
                              </button>
                              <button
                                onClick={() => handleTranslateToggle(comment._id, comment.text)}
                                disabled={translatingId === comment._id}
                                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition"
                              >
                                {translatingId === comment._id
                                  ? "Translating..."
                                  : translatedComments[comment._id]
                                  ? "Undo Translation"
                                  : "🌐 Translate to EN"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 dark:bg-zinc-900/40 dark:border-zinc-800 rounded-3xl p-12 text-center shadow-xl space-y-4 flex flex-col items-center justify-center min-h-[320px]">
              <span className="text-5xl">🎬</span>
              <h3 className="text-xl font-black text-stone-900 dark:text-white">Select a Stream to Watch</h3>
              <p className="text-stone-500 dark:text-zinc-400 text-xs max-w-sm leading-relaxed">
                Choose any video from the Trending Streams list below to start watching.
              </p>
            </div>
          )}

          {/* Seeded Videos List */}
          <div>
            <h3 className="text-xl font-black mb-4 text-stone-900 dark:text-white">Trending Streams</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {videos.map((video) => (
                <div key={video._id} className="bg-white border border-stone-200 dark:bg-zinc-900/40 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition">
                  <div
                    onClick={() => { setSelectedVideo(video); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="cursor-pointer group"
                  >
                    <div className="relative aspect-video overflow-hidden">
                      {video.isPremium && (
                        <div className="absolute top-3 left-3 bg-red-600/90 text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-red-500 z-10">
                          🔒 Premium
                        </div>
                      )}
                      <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      <div className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-xs font-bold">
                        {Math.floor(video.durationSeconds / 60)}m
                      </div>
                    </div>
                    <div className="p-4">
                      <h4 className="font-bold text-lg text-stone-900 dark:text-white group-hover:text-emerald-500 transition">{video.title}</h4>
                      <p className="text-stone-500 dark:text-zinc-400 text-xs mt-1 line-clamp-2">{video.description}</p>
                    </div>
                  </div>
                  <div className="px-4 pb-4 flex space-x-2">
                    <button
                      onClick={() => handleCreateParty(video._id)}
                      className="flex-1 bg-stone-200 hover:bg-stone-300 text-stone-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 text-xs font-bold py-2.5 rounded-lg transition"
                    >
                      Watch Party
                    </button>
                    <button
                      onClick={() => handleDownload(video._id)}
                      className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold px-4 py-2.5 rounded-lg border border-emerald-500/20 transition"
                    >
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Column: Active Plan & Upgrade Section & Join party by code */}
        <div className="space-y-8">
          {/* Join Watch Party Panel */}
          <div className="bg-white border border-stone-200 dark:bg-zinc-900/40 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black mb-4 text-stone-900 dark:text-white">Join Watch Party</h3>
            <form onSubmit={handleJoinPartyByCode} className="flex space-x-2">
              <input
                type="text"
                required
                placeholder="Enter Room Code (e.g. 8F2K)"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className="flex-1 bg-stone-50 border border-stone-300 text-stone-900 dark:bg-zinc-950 dark:border-zinc-850 rounded-xl px-4 py-2.5 text-sm uppercase dark:text-white focus:outline-none focus:border-emerald-500 transition"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition"
              >
                Join
              </button>
            </form>
          </div>

          {/* Premium Membership Plans */}
          <div className="bg-white border border-stone-200 dark:bg-zinc-900/40 dark:border-zinc-800 rounded-3xl p-6 space-y-6 shadow-sm">
            <div>
              <h3 className="text-lg font-black text-stone-900 dark:text-white">Upgrade Membership</h3>
              <p className="text-zinc-400 text-xs mt-1">Unlock longer watch durations and daily download capacity.</p>
            </div>

            <div className="space-y-4">
              {/* Free Plan details */}
              <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-850 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Free Plan</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">5m watch limit • 1 download/day</p>
                </div>
                {user.plan === "Free" ? (
                  <span className="text-xs font-black text-zinc-400">Current</span>
                ) : null}
              </div>

              {/* Bronze Plan */}
              <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-850 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Bronze Plan</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">7m watch limit • Unlimited downloads</p>
                  <p className="text-xs text-emerald-400 font-black mt-1">₹10 / month</p>
                </div>
                {user.plan === "Bronze" ? (
                  <span className="text-xs font-black text-emerald-400">Current</span>
                ) : (
                  <button
                    onClick={() => handleUpgradePlan("Bronze")}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition"
                  >
                    Upgrade
                  </button>
                )}
              </div>

              {/* Silver Plan */}
              <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-850 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Silver Plan</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">10m watch limit • Unlimited downloads</p>
                  <p className="text-xs text-emerald-400 font-black mt-1">₹50 / month</p>
                </div>
                {user.plan === "Silver" ? (
                  <span className="text-xs font-black text-emerald-400">Current</span>
                ) : (
                  <button
                    onClick={() => handleUpgradePlan("Silver")}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition"
                  >
                    Upgrade
                  </button>
                )}
              </div>

              {/* Gold Plan */}
              <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-850 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Gold Plan</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">Unlimited watch time & downloads</p>
                  <p className="text-xs text-emerald-400 font-black mt-1">₹100 / month</p>
                </div>
                {user.plan === "Gold" ? (
                  <span className="text-xs font-black text-emerald-400">Current</span>
                ) : (
                  <button
                    onClick={() => handleUpgradePlan("Gold")}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
