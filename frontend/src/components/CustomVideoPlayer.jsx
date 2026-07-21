import React, { useState, useEffect, useRef } from "react";

export default function CustomVideoPlayer({
  src,
  url,
  videoUrl,
  source,
  sourceUrl,
  link,
  selectedVideo,
  title,
  isPremium,
  isFreeUser,
  onNext,
  hasNext,
  videoRef,
  onUpgrade
}) {
  const getSrcString = (val) => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object") {
      return val.sourceUrl || val.videoUrl || val.url || val.source || val.link || "";
    }
    return "";
  };

  const actualSrc =
    getSrcString(selectedVideo) ||
    getSrcString(src) ||
    getSrcString(sourceUrl) ||
    getSrcString(videoUrl) ||
    getSrcString(url) ||
    getSrcString(source) ||
    getSrcString(link) ||
    "";

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Double-tap alert states
  const [showRewindAlert, setShowRewindAlert] = useState(false);
  const [showForwardAlert, setShowForwardAlert] = useState(false);
  
  // Autoplay countdown state
  const [countdown, setCountdown] = useState(null);

  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const lastTapRef = useRef(0);
  const controlsTimeoutRef = useRef(null);
  const [showControls, setShowControls] = useState(true);

  // Sync ref with parent
  useEffect(() => {
    if (videoRef) {
      if (typeof videoRef === "function") {
        videoRef(localVideoRef.current);
      } else {
        videoRef.current = localVideoRef.current;
      }
    }
  }, [videoRef]);

  // Load new media whenever actualSrc changes
  useEffect(() => {
    const video = localVideoRef.current;
    if (video && actualSrc) {
      video.load();
    }
  }, [actualSrc]);

  // Handle controls hide timer
  const triggerShowControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  useEffect(() => {
    triggerShowControls();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    if (isPremium && isFreeUser) return;
    const video = localVideoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch((err) => console.log("Playback error:", err));
    }
  };

  const handlePlayPauseEvent = () => {
    const video = localVideoRef.current;
    if (!video) return;
    setIsPlaying(!video.paused);
  };

  const handleTimeUpdate = () => {
    const video = localVideoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  };

  const handleLoadedMetadata = () => {
    const video = localVideoRef.current;
    if (!video) return;
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
    setIsLoading(false);
  };

  const handleSeek = (e) => {
    const video = localVideoRef.current;
    if (!video) return;
    const newTime = Number(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
    triggerShowControls();
  };

  const handleVolumeChange = (e) => {
    const video = localVideoRef.current;
    if (!video) return;
    const newVol = Number(e.target.value);
    video.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const toggleMute = () => {
    const video = localVideoRef.current;
    if (!video) return;
    const muteState = !isMuted;
    video.muted = muteState;
    setIsMuted(muteState);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error("Fullscreen request failed", err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const seekDiff = (amount) => {
    const video = localVideoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + amount));
    triggerShowControls();
  };

  const handleTap = (e) => {
    if (isPremium && isFreeUser) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (x < width * 0.4) {
        // Double tap left: Rewind 10s
        seekDiff(-10);
        setShowRewindAlert(true);
        setTimeout(() => setShowRewindAlert(false), 600);
      } else if (x > width * 0.6) {
        // Double tap right: Forward 10s
        seekDiff(10);
        setShowForwardAlert(true);
        setTimeout(() => setShowForwardAlert(false), 600);
      }
      lastTapRef.current = 0;
    } else {
      // Single tap
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current === now) {
          if (x >= width * 0.4 && x <= width * 0.6) {
            togglePlay();
          } else {
            triggerShowControls();
          }
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  // Video Buffering spinners
  const handleWaiting = () => setIsLoading(true);
  const handleCanPlay = () => {
    setIsLoading(false);
    const video = localVideoRef.current;
    if (video && video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
  };
  const handlePlaying = () => {
    setIsLoading(false);
    setCountdown(null); // Cancel countdown if video starts playing
  };

  // Video End Autoplay Countdown
  const handleEnded = () => {
    setIsPlaying(false);
    if (hasNext && onNext) {
      setCountdown(5);
    }
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (onNext) onNext();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onNext]);

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === Infinity) return "00:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerShowControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-800 group shadow-lg select-none"
    >
      {/* Premium Content Overlay */}
      {isPremium && isFreeUser ? (
        <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 z-30">
          <span className="text-4xl">🔒</span>
          <h3 className="text-xl font-black text-white mt-3">Premium Content</h3>
          <p className="text-zinc-400 text-xs mt-2 max-w-xs leading-relaxed">
            "{title}" is a premium stream. Upgrade to Bronze, Silver, or Gold plan to watch.
          </p>
          <button
            onClick={() => onUpgrade && onUpgrade("Bronze")}
            className="mt-5 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-950/20"
          >
            Upgrade to Bronze for ₹10
          </button>
        </div>
      ) : (
        <>
          <video
            ref={localVideoRef}
            key={actualSrc}
            src={actualSrc}
            playsInline
            preload="auto"
            onPlay={handlePlayPauseEvent}
            onPause={handlePlayPauseEvent}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedMetadata}
            onDurationChange={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onCanPlayThrough={handleCanPlay}
            onWaiting={handleWaiting}
            onPlaying={handlePlaying}
            onEnded={handleEnded}
            onError={(e) => {
              setIsLoading(false);
              console.error("Video Error. Src:", actualSrc, e);
            }}
            className="absolute inset-0 w-full h-full object-contain cursor-pointer z-0"
            onClick={handleTap}
          />

          {/* Loading buffering indicator */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 pointer-events-none">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
            </div>
          )}

          {/* Double tap skipping visual animations */}
          {showRewindAlert && (
            <div className="absolute left-[15%] top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md rounded-full px-5 py-3 text-sm font-black text-white flex items-center space-x-2 z-20 animate-ping pointer-events-none">
              <span>◀◀ -10s</span>
            </div>
          )}
          {showForwardAlert && (
            <div className="absolute right-[15%] top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md rounded-full px-5 py-3 text-sm font-black text-white flex items-center space-x-2 z-20 animate-ping pointer-events-none">
              <span>+10s ▶▶</span>
            </div>
          )}

          {/* Autoplay Next Video Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 z-30">
              <h4 className="text-lg font-black text-zinc-300">Up Next Autoplay</h4>
              <p className="text-zinc-500 text-xs mt-1">Starting next stream in</p>
              <div className="text-5xl font-black text-emerald-400 mt-4 animate-bounce">
                {countdown}
              </div>
              <div className="flex space-x-4 mt-6">
                <button
                  onClick={() => setCountdown(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setCountdown(null);
                    if (onNext) onNext();
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition"
                >
                  Play Now
                </button>
              </div>
            </div>
          )}

          {/* Title Header Badge */}
          <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 bg-zinc-900/80 backdrop-blur-md px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold border border-zinc-700 pointer-events-none z-10 max-w-[65%] sm:max-w-none truncate">
            {title}
          </div>

          {/* Custom controls overlay bar */}
          <div
            className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 sm:p-4 flex flex-col space-y-2 sm:space-y-3 transition-opacity duration-300 z-10 ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Seek Bar */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <span className="text-[9px] sm:text-[10px] font-mono text-zinc-400">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-emerald-500 bg-zinc-800 h-1 sm:h-1.5 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] sm:text-[10px] font-mono text-zinc-400">
                {formatTime(duration)}
              </span>
            </div>

            {/* Bottom Controls row */}
            <div className="flex items-center justify-between">
              {/* Playback navigation buttons */}
              <div className="flex items-center space-x-3 sm:space-x-4">
                <button
                  onClick={togglePlay}
                  className="text-zinc-300 hover:text-white transition focus:outline-none"
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => seekDiff(-10)}
                  className="text-zinc-400 hover:text-white transition focus:outline-none text-[10px] sm:text-xs font-bold"
                  title="Rewind 10s"
                >
                  -10s
                </button>

                <button
                  onClick={() => seekDiff(10)}
                  className="text-zinc-400 hover:text-white transition focus:outline-none text-[10px] sm:text-xs font-bold"
                  title="Forward 10s"
                >
                  +10s
                </button>

                {hasNext && onNext && (
                  <button
                    onClick={onNext}
                    className="text-zinc-400 hover:text-white transition focus:outline-none"
                    title="Next Stream"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Volume & Fullscreen controls */}
              <div className="flex items-center space-x-2 sm:space-x-4">
                <div className="hidden sm:flex items-center space-x-2">
                  <button
                    onClick={toggleMute}
                    className="text-zinc-400 hover:text-white transition focus:outline-none"
                  >
                    {isMuted || volume === 0 ? (
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-12 sm:w-16 accent-emerald-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <button
                  onClick={toggleMute}
                  className="sm:hidden text-zinc-400 hover:text-white transition focus:outline-none"
                  title="Mute/Unmute"
                >
                  {isMuted || volume === 0 ? (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="text-zinc-400 hover:text-white transition focus:outline-none"
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
