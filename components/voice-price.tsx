"use client";

import { useState } from "react";
import { api, json } from "./client";

// Chrome's Web Speech API is not in TypeScript's DOM types.
interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void;
}
type RecognitionCtor = new () => Recognition;

export function VoicePrice({ disabled }: { disabled: boolean }) {
  const [phase, setPhase] = useState<"idle" | "listening" | "matching">("idle");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function listen() {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setMessage({ ok: false, text: "Voice input needs Chrome. Type the price on the card instead." });

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    let heard = "";
    rec.onresult = (e) => {
      heard = e.results[0]?.[0]?.transcript ?? "";
    };
    rec.onerror = (e) => setMessage({ ok: false, text: `Didn't catch that (${e.error}). Try again or type it.` });
    rec.onend = async () => {
      if (!heard) return setPhase("idle");
      setPhase("matching");
      setMessage({ ok: true, text: `Heard: “${heard}”` });
      try {
        const res = await api<{ name: string; price_usd: number }>("/api/price-voice", json({ transcript: heard }), 45_000);
        setMessage({ ok: true, text: `${res.name}: $${res.price_usd.toFixed(2)}` });
      } catch (err) {
        setMessage({ ok: false, text: (err as Error).message });
      } finally {
        setPhase("idle");
      }
    };
    setMessage(null);
    setPhase("listening");
    rec.start();
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <button
        onClick={listen}
        disabled={disabled || phase !== "idle"}
        className={`px-5 py-3 rounded-xl text-lg font-semibold text-white disabled:opacity-60 ${
          phase === "listening" ? "bg-red-600 animate-pulse" : "bg-ink hover:bg-zinc-800"
        }`}
      >
        {phase === "listening" ? "● Listening…" : phase === "matching" ? "Matching…" : "🎤 Say a price"}
      </button>
      {message && <span className={`text-lg font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span>}
    </div>
  );
}
