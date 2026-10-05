"use client";

import { useEffect, useRef, useState } from "react";

const CLIP_SECONDS = 5;
const CLIP_FRAMES = 10;

/** Upload a shelf video, or record a short webcam clip as JPEG frames. */
export function Capture({ busy, onCapture }: { busy: boolean; onCapture: (form: FormData) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      setError(`Camera unavailable: ${(err as Error).message}`);
    }
  }

  async function recordClip() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return setError("Camera is not ready yet");
    const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    const form = new FormData();
    const interval = (CLIP_SECONDS * 1000) / CLIP_FRAMES;
    for (let i = 0; i < CLIP_FRAMES; i++) {
      setCountdown(Math.ceil(((CLIP_FRAMES - i) * interval) / 1000));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (blob) form.append("frames", blob, `frame-${i}.jpg`);
      await new Promise((r) => setTimeout(r, interval));
    }
    setCountdown(null);
    onCapture(form);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("video", file);
    onCapture(form);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className={`btn btn-primary btn-lg ${busy ? "opacity-45 pointer-events-none" : "cursor-pointer"}`}>
          Upload video
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {cameraOn ? (
          <button disabled={busy || countdown !== null} onClick={recordClip} className="btn btn-lg btn-danger">
            {countdown !== null ? `Recording, ${countdown} s left` : `Record ${CLIP_SECONDS} s`}
          </button>
        ) : (
          <button disabled={busy} onClick={startCamera} className="btn btn-lg">
            Use webcam
          </button>
        )}
      </div>
      {cameraOn && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full max-w-md rounded-lg bg-ink ${countdown !== null ? "ring-4 ring-brick" : ""}`}
        />
      )}
      {error && <p className="notice notice-error">{error}</p>}
    </div>
  );
}
