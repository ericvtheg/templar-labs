import { type ReactNode, useEffect, useRef, useState } from "react";
import { ownSpeechPlayback, releaseSpeechPlayback, stopSpeechPlayback } from "../lib/audio.ts";
import type { SpeechSpeed } from "../lib/voice-config.ts";

export function SpeechPlayer({
  text,
  disabled = false,
  children,
}: {
  text: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const player = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      releaseSpeechPlayback(player.current);
      window.speechSynthesis?.cancel();
    };
  }, []);
  function play(speed: SpeechSpeed) {
    releaseSpeechPlayback(player.current);
    const params = new URLSearchParams({ text, speed });
    const audio = new Audio(`/api/trip/speech?${params}`);
    player.current = audio;
    ownSpeechPlayback(audio);
    setError("");
    setStatus("loading");
    const current = () => alive.current && player.current === audio;
    audio.addEventListener("playing", () => {
      if (current()) {
        setStatus("playing");
      }
    });
    for (const event of ["pause", "ended"]) {
      audio.addEventListener(event, () => {
        if (current()) {
          setStatus("idle");
        }
      });
    }
    const failed = () => {
      if (current()) {
        setStatus("idle");
        setError(
          "ElevenLabs audio couldn’t play. Try again in a moment, or use the optional device voice below. If this persists, the voice service needs attention.",
        );
      }
    };
    audio.addEventListener("error", failed);
    // Invoked directly from a tap: Safari can start playback as soon as the server audio arrives.
    void audio.play().catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        return;
      }
      failed();
    });
  }
  function deviceVoice() {
    stopSpeechPlayback();
    setStatus("idle");
    const voice = window.speechSynthesis
      ?.getVoices()
      .find((entry) => /^zh[-_]?(CN|Hans|SG)/i.test(entry.lang) || entry.lang === "zh");
    if (!voice) {
      setError(
        "No Mandarin device voice is installed. Add Chinese (China) in your device’s speech settings, or retry ElevenLabs.",
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.voice = voice;
    utterance.rate = 0.8;
    setError("Using your device voice—not ElevenLabs.");
    window.speechSynthesis.speak(utterance);
  }
  return (
    <div className="speech-player">
      <div className="button-row">
        <button type="button" disabled={disabled} onClick={() => play("normal")}>
          ▶ Listen
        </button>
        <button type="button" disabled={disabled} onClick={() => play("slow")}>
          ▶ Slower
        </button>
        {children}
        {status !== "idle" && (
          <button
            type="button"
            onClick={() => {
              releaseSpeechPlayback(player.current);
              player.current = null;
              setStatus("idle");
            }}
          >
            ■ Stop audio
          </button>
        )}
      </div>
      <p className="speech-status" aria-live="polite">
        {status === "loading"
          ? "Loading Mandarin audio…"
          : status === "playing"
            ? "Speaking Mandarin · ElevenLabs"
            : "Mandarin audio by ElevenLabs · replay as often as you like"}
      </p>
      {error && (
        <div className="notice" role="status">
          <p>{error}</p>
          <button type="button" disabled={disabled} onClick={deviceVoice}>
            Use device voice instead
          </button>
        </div>
      )}
    </div>
  );
}
