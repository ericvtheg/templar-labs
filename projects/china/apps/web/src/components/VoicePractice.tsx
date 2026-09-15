import { useEffect, useRef, useState } from "react";
import { stopSpeechPlayback } from "../lib/audio.ts";
import { SpeechPlayer } from "./SpeechPlayer.tsx";

function stopTracks(media: MediaStream | null) {
  for (const track of media?.getTracks() ?? []) {
    track.stop();
  }
}
async function audioBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
export function VoicePractice({
  text,
  missionId,
  onTranscript,
}: {
  text: string;
  missionId?: string;
  onTranscript?: (text: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      upload.current?.abort();
      if (timer.current) {
        clearTimeout(timer.current);
      }
      if (recorder.current?.state === "recording") {
        recorder.current.stop();
      }
      stopTracks(stream.current);
    };
  }, []);
  useEffect(
    () => () => {
      if (audio) {
        URL.revokeObjectURL(audio);
      }
    },
    [audio],
  );
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage(
        "Recording needs HTTPS and microphone support. Try Safari or Chrome, or tap a reply instead.",
      );
      return;
    }
    setPending(true);
    setMessage("");
    stopSpeechPlayback();
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stopTracks(media);
        return;
      }
      stream.current = media;
      const instance = new MediaRecorder(media, { audioBitsPerSecond: 64_000 });
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
        }
      };
      instance.onstop = () => {
        if (timer.current) {
          clearTimeout(timer.current);
        }
        stopTracks(media);
        if (alive.current) {
          setRecording(false);
          if (chunks.length) {
            const recordingBlob = new Blob(chunks, { type: instance.mimeType });
            setBlob(recordingBlob);
            setAudio(URL.createObjectURL(recordingBlob));
          }
        }
      };
      instance.addEventListener("error", () => {
        stopTracks(media);
        if (alive.current) {
          setRecording(false);
          setMessage("Recording failed. Try again, or tap a reply instead.");
        }
      });
      instance.start();
      setRecording(true);
      timer.current = setTimeout(() => {
        if (instance.state === "recording") {
          instance.stop();
        }
      }, 20_000);
    } catch {
      stopTracks(stream.current);
      if (alive.current) {
        setMessage(
          "Microphone unavailable or permission denied. Allow it in browser settings, or tap a reply instead.",
        );
      }
    } finally {
      if (alive.current) {
        setPending(false);
      }
    }
  }
  async function transcribe() {
    if (!blob || !missionId || !onTranscript) {
      return;
    }
    if (blob.size > 600_000) {
      setMessage("That recording is too large. Try a shorter take, under 20 seconds.");
      return;
    }
    setTranscribing(true);
    setMessage("");
    const controller = new AbortController();
    upload.current = controller;
    try {
      const response = await fetch("/api/trip/transcribe", {
        method: "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          missionId,
          audioBase64: await audioBase64(blob),
          contentType: blob.type,
        }),
      });
      const result = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !result.text) {
        throw new Error(result.error ?? "No speech was recognized. Try a shorter, clearer take.");
      }
      if (alive.current) {
        onTranscript(result.text);
        setMessage(
          "Your spoken reply was sent for feedback. This checks recognized words, not pronunciation or tones.",
        );
      }
    } catch (cause) {
      if (alive.current) {
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Couldn’t hear that take. Try recording again, or use the tap-to-choose option.",
        );
      }
    } finally {
      if (alive.current) {
        setTranscribing(false);
      }
    }
  }
  return (
    <div className="voice-practice">
      <SpeechPlayer text={text} disabled={recording || pending || transcribing}>
        <button
          type="button"
          className={recording ? "recording" : ""}
          disabled={pending || transcribing}
          onClick={() => void record()}
        >
          {pending ? "Allow microphone…" : recording ? "■ Stop recording" : "● Record yourself"}
        </button>
      </SpeechPlayer>
      {recording && (
        <div className="mic-live" role="status">
          <span aria-hidden="true">● ▂ ▅ ▇ ▅ ▂</span> Recording · stops after 20 seconds
        </div>
      )}
      {audio && (
        <div className="playback">
          {/* biome-ignore lint/a11y/useMediaCaption: Local learner audio is untranscribed; a target phrase is not an accurate caption of what was said. */}
          <audio
            controls
            src={audio}
            aria-label="Your practice recording"
            onPlay={stopSpeechPlayback}
          />
          <button
            type="button"
            disabled={transcribing}
            onClick={() => {
              setAudio(null);
              setBlob(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
      {blob && onTranscript && missionId && (
        <button
          type="button"
          className="primary"
          disabled={recording || pending || transcribing}
          onClick={() => void transcribe()}
        >
          {transcribing ? "Listening to your take…" : "Check what I said →"}
        </button>
      )}
      <p className="fine-print">
        Your recording stays in this tab
        {onTranscript
          ? " unless you choose ‘Check what I said’, which sends it to ElevenLabs for transcription"
          : " and is never uploaded"}
        . It disappears when you leave this phrase. No fake tone scores.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
