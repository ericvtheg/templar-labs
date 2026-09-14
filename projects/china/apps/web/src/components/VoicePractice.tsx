import { useEffect, useRef, useState } from "react";

function stopTracks(media: MediaStream | null) {
  for (const track of media?.getTracks() ?? []) {
    track.stop();
  }
}

export function VoicePractice({ text }: { text: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const update = () =>
      setVoices(
        "speechSynthesis" in window
          ? window.speechSynthesis
              .getVoices()
              .filter((voice) => /^zh[-_]?(CN|Hans|SG)/i.test(voice.lang) || voice.lang === "zh")
          : [],
      );
    update();
    window.speechSynthesis?.addEventListener("voiceschanged", update);
    return () => {
      alive.current = false;
      window.speechSynthesis?.removeEventListener("voiceschanged", update);
      window.speechSynthesis?.cancel();
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
  function listen(rate: number) {
    const voice = voices[0];
    if (!voice) {
      setMessage(
        "No Mandarin voice is installed. Add a Mandarin / Chinese (China) voice in your device’s speech settings, then reload. The text and recorder still work.",
      );
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.voice = voice;
    utterance.rate = rate;
    utterance.addEventListener("error", () => {
      if (alive.current) {
        setMessage(
          "Audio couldn’t play. Check your device’s speech settings or try another browser.",
        );
      }
    });
    setMessage("");
    window.speechSynthesis.speak(utterance);
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage(
        "Recording needs HTTPS and a browser with microphone support. Try Safari or Chrome, or simply repeat aloud.",
      );
      return;
    }
    setPending(true);
    setMessage("");
    try {
      window.speechSynthesis?.cancel();
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stopTracks(media);
        return;
      }
      stream.current = media;
      const instance = new MediaRecorder(media);
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
            setAudio(URL.createObjectURL(new Blob(chunks, { type: instance.mimeType })));
          }
        }
      };
      instance.addEventListener("error", () => {
        stopTracks(media);
        if (alive.current) {
          setRecording(false);
          setMessage("Recording failed. You can still practice aloud.");
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
          "Microphone unavailable or permission denied. Allow microphone access in browser settings, or practice aloud without recording.",
        );
      }
    } finally {
      if (alive.current) {
        setPending(false);
      }
    }
  }
  return (
    <div className="voice-practice">
      <div className="button-row">
        <button type="button" disabled={recording || pending} onClick={() => listen(0.85)}>
          ▶ Listen
        </button>
        <button type="button" disabled={recording || pending} onClick={() => listen(0.6)}>
          ▶ Slower
        </button>
        <button
          type="button"
          className={recording ? "recording" : ""}
          disabled={pending}
          onClick={() => void record()}
        >
          {pending ? "Allow microphone…" : recording ? "■ Stop recording" : "● Record yourself"}
        </button>
      </div>
      {audio && (
        <div className="playback">
          {/* biome-ignore lint/a11y/useMediaCaption: Local learner audio is untranscribed; captions must not misrepresent the target phrase as what was actually said. */}
          <audio controls src={audio} aria-label="Your practice recording" />
          <button type="button" onClick={() => setAudio(null)}>
            Delete
          </button>
        </div>
      )}
      <p className="fine-print">
        Listen twice → repeat → record → compare. Recordings stay in this tab and disappear when you
        leave this phrase. No fake pronunciation scores.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}
