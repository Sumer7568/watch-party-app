import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function useWatchPartyRtc(roomCode, peerId, sendSignal) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [error, setError] = useState("");

  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const cameraTrackRef = useRef(null);

  const updateRemoteStream = useCallback((remotePeerId, stream) => {
    setRemoteStreams((prev) => {
      if (!stream) {
        const next = { ...prev };
        delete next[remotePeerId];
        return next;
      }
      return { ...prev, [remotePeerId]: stream };
    });
  }, []);

  // Flush queued ICE candidates after remote description is set
  const flushPendingIceCandidates = useCallback(async (remotePeerId, pc) => {
    const pending = pendingIceRef.current.get(remotePeerId) || [];
    if (pending.length > 0 && pc.remoteDescription) {
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("[WebRTC] Error adding queued ICE candidate:", e.message);
        }
      }
      pendingIceRef.current.set(remotePeerId, []);
    }
  }, []);

  const createPeerConnection = useCallback(
    (remotePeerId) => {
      if (peersRef.current.has(remotePeerId)) {
        return peersRef.current.get(remotePeerId);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(remotePeerId, pc);

      // Add local media tracks if available
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStreamRef.current);
          } catch (e) {
            console.warn("[WebRTC] Error adding local track:", e.message);
          }
        });
      }

      // Handle incoming remote media stream/tracks
      pc.ontrack = (event) => {
        const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);
        updateRemoteStream(remotePeerId, stream);
      };

      // Handle ICE Candidate generation
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal("ice", { target: remotePeerId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
          updateRemoteStream(remotePeerId, null);
          if (pc.connectionState === "closed" || pc.connectionState === "failed") {
            pc.close();
            peersRef.current.delete(remotePeerId);
            pendingIceRef.current.delete(remotePeerId);
          }
        }
      };

      return pc;
    },
    [sendSignal, updateRemoteStream]
  );

  const makeOffer = useCallback(
    async (remotePeerId) => {
      try {
        const pc = createPeerConnection(remotePeerId);

        // Only initiate offer if connection state is stable
        if (pc.signalingState !== "stable") {
          return;
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal("offer", { target: remotePeerId, sdp: offer });
      } catch (err) {
        console.error("[WebRTC] Error making offer to", remotePeerId, err.message);
      }
    },
    [createPeerConnection, sendSignal]
  );

  const handleSignalEvent = useCallback(
    async (event) => {
      const { sender, type, payload } = event;
      if (!payload || sender === peerId) return;

      // Handle join or presence signal:
      // Impolite peer rule (peerId > sender) initiates negotiation to prevent collision
      if (type === "join" || type === "presence") {
        const targetPeerId = payload.peerId || sender;
        if (targetPeerId && targetPeerId !== peerId) {
          if (peerId > targetPeerId) {
            await makeOffer(targetPeerId);
          }
        }
        return;
      }

      if (payload.target && payload.target !== peerId) return;

      if (type === "offer") {
        try {
          const pc = createPeerConnection(sender);
          const isPolite = peerId < sender;

          // Handle offer collision using Perfect Negotiation rules
          const offerCollision = pc.signalingState !== "stable";
          if (offerCollision) {
            if (!isPolite) {
              return;
            }
            await pc.setLocalDescription({ type: "rollback" });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          await flushPendingIceCandidates(sender, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal("answer", { target: sender, sdp: answer });
        } catch (err) {
          console.error("[WebRTC] Error handling offer from", sender, err.message);
        }
        return;
      }

      if (type === "answer") {
        try {
          const pc = peersRef.current.get(sender);
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushPendingIceCandidates(sender, pc);
          }
        } catch (err) {
          console.error("[WebRTC] Error handling answer from", sender, err.message);
        }
        return;
      }

      if (type === "ice") {
        try {
          const pc = peersRef.current.get(sender);
          if (payload.candidate) {
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              const pending = pendingIceRef.current.get(sender) || [];
              pending.push(payload.candidate);
              pendingIceRef.current.set(sender, pending);
            }
          }
        } catch (err) {
          console.warn("[WebRTC] Error adding ICE candidate:", err.message);
        }
        return;
      }

      if (type === "leave") {
        const pc = peersRef.current.get(sender);
        if (pc) {
          pc.close();
          peersRef.current.delete(sender);
        }
        pendingIceRef.current.delete(sender);
        updateRemoteStream(sender, null);
      }
    },
    [createPeerConnection, flushPendingIceCandidates, makeOffer, peerId, sendSignal, updateRemoteStream]
  );

  const startLocalMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      setError("");

      peersRef.current.forEach((pc) => {
        stream.getTracks().forEach((track) => {
          const senders = pc.getSenders();
          if (!senders.some((s) => s.track?.kind === track.kind)) {
            try {
              pc.addTrack(track, stream);
            } catch (e) {
              console.warn("[WebRTC] Add track error:", e.message);
            }
          }
        });
      });

      return stream;
    } catch {
      setError("Camera/microphone permission is required for the video call.");
      return null;
    }
  }, []);

  const announcePresence = useCallback(async () => {
    await sendSignal("join", { peerId, muted, cameraOff, screenSharing });
  }, [cameraOff, muted, peerId, screenSharing, sendSignal]);

  const replaceOutgoingVideoTrack = useCallback(
    async (newTrack) => {
      for (const pc of peersRef.current.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(newTrack);
        } else if (newTrack && localStreamRef.current) {
          try {
            pc.addTrack(newTrack, localStreamRef.current);
          } catch (e) {
            console.warn("[WebRTC] Error adding track on replace:", e.message);
          }
        }
      }
    },
    []
  );

  const toggleMute = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
    await sendSignal("presence", { peerId, muted: next, cameraOff, screenSharing });
  }, [cameraOff, muted, peerId, screenSharing, sendSignal]);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream || screenSharing) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCameraOff(next);
    await sendSignal("presence", { peerId, muted, cameraOff: next, screenSharing });
  }, [cameraOff, muted, peerId, screenSharing, sendSignal]);

  const startScreenShare = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;
      await replaceOutgoingVideoTrack(screenTrack);
      setScreenSharing(true);
      setCameraOff(false);
      screenTrack.onended = async () => {
        await replaceOutgoingVideoTrack(cameraTrackRef.current);
        setScreenSharing(false);
        await sendSignal("presence", { peerId, muted, cameraOff, screenSharing: false });
      };
      await sendSignal("presence", { peerId, muted, cameraOff: false, screenSharing: true });
    } catch {
      setError("Screen sharing was cancelled or blocked.");
    }
  }, [cameraOff, muted, peerId, replaceOutgoingVideoTrack, sendSignal]);

  const stopScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    await replaceOutgoingVideoTrack(cameraTrackRef.current);
    setScreenSharing(false);
    await sendSignal("presence", { peerId, muted, cameraOff, screenSharing: false });
  }, [cameraOff, muted, peerId, replaceOutgoingVideoTrack, sendSignal]);

  const leaveCall = useCallback(async () => {
    await sendSignal("leave", { peerId });
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
  }, [peerId, sendSignal]);

  useEffect(
    () => () => {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      pendingIceRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  return {
    localStream,
    remoteStreams,
    muted,
    cameraOff,
    screenSharing,
    error,
    startLocalMedia,
    announcePresence,
    handleSignalEvent,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    leaveCall,
  };
}
