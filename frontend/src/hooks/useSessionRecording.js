import { useCallback, useRef, useState } from "react";

export function useSessionRecording(isHost) {
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(
    async (videoElement, localStream) => {
      if (!isHost || recording) return;
      if (!videoElement) return;

      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      const canvasStream = canvas.captureStream(24);

      const audioTracks = localStream?.getAudioTracks() || [];
      const mixedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const drawFrame = () => {
        if (!recorderRef.current || recorderRef.current.state !== "recording") return;
        ctx.fillStyle = "#111210";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (videoElement.readyState >= 2) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(drawFrame);
      };

      const recorder = new MediaRecorder(mixedStream, { mimeType: "video/webm;codecs=vp8,opus" });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        setRecordings((prev) => [
          { id: stamp, url, createdAt: new Date().toISOString() },
          ...prev,
        ]);
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      drawFrame();
    },
    [isHost, recording]
  );

  const stopRecording = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  return { recording, recordings, startRecording, stopRecording };
}
