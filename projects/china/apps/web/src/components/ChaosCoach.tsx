import { useEffect, useId, useRef, useState } from "react";
import type { CoachReply, CoachScene } from "../lib/coach-types.ts";
import type { Mission } from "../lib/curriculum.ts";
import { tripApi } from "../lib/trip-api.ts";
import { VoicePractice } from "./VoicePractice.tsx";
export function ChaosCoach({ mission, focus }: { mission: Mission; focus?: number }) {
  const [scene, setScene] = useState<CoachScene | null>(null);
  const [messages, setMessages] = useState<{ id: string; role: "you" | "coach"; text: string }[]>(
    [],
  );
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [won, setWon] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const inputId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  async function deal() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const next = await tripApi<CoachScene>(
        "coach",
        { action: "start", missionId: mission.id, focus, avoid: scene?.target.id },
        request.signal,
      );
      setScene(next);
      setMessages([]);
      setAnswer("");
      setWon(false);
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Couldn’t deal a scene.");
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
      }
    }
  }
  async function send() {
    if (!scene || !answer.trim()) {
      return;
    }
    const submitted = answer.trim();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const result = await tripApi<CoachReply>(
        "coach",
        { action: "answer", missionId: mission.id, sceneId: scene.id, answer: submitted },
        request.signal,
      );
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "you", text: submitted },
        {
          id: crypto.randomUUID(),
          role: "coach",
          text: `${result.source === "fallback" ? "Backup coach · " : ""}${result.feedback}`,
        },
      ]);
      setWon(result.correct);
      setAnswer("");
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Coach unavailable.");
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
      }
    }
  }
  return (
    <section className="chaos-lab">
      <div className="encounter-label">
        <span>✦ LIVE FIELD TEST</span>
        <span>TEXT OR VOICE</span>
      </div>
      <h2>The boys in the wild.</h2>
      <p>
        Same useful Mandarin. A different fucking situation. Ask questions, try pinyin, take a hint,
        or say your answer out loud.
      </p>
      {!scene ? (
        <div className="chaos-poster">
          <div aria-hidden="true">🎤 🍺 🚄</div>
          <h3>The crew is unsupervised.</h3>
          <p>Deal a fictional situation from this lesson. No surprise vocabulary test.</p>
          <button className="primary" type="button" disabled={busy} onClick={() => void deal()}>
            {busy ? "Something is going wrong in Beijing…" : "Deal me a situation →"}
          </button>
        </div>
      ) : (
        <>
          <div className="scene-bubble">
            <span className="eyebrow">
              {scene.source === "ai"
                ? "AI-GENERATED SCENARIO"
                : scene.source === "curated"
                  ? "FIXED EMERGENCY FACTS · FICTIONAL CREW"
                  : "CURATED BACKUP · AI TEMPORARILY UNAVAILABLE"}
            </span>
            <p>{scene.scene}</p>
            <strong>{scene.prompt}</strong>
          </div>
          <div className="chat-log" role="log" aria-label="Practice conversation">
            {messages.map((message) => (
              <div className={`chat-bubble ${message.role}`} key={message.id}>
                <small>{message.role === "you" ? "YOU" : "YOUR MANDARIN WINGMAN"}</small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          {won && (
            <p className="success-note" role="status">
              ✓ You got the message across. Remix it, ask a follow-up, or deal another situation.
            </p>
          )}
          <form
            className="coach-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor={inputId}>What do you say?</label>
            <textarea
              id={inputId}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={600}
              rows={3}
              placeholder={
                scene.target.kind === "emergency"
                  ? "Three-digit number…"
                  : "Chinese, pinyin, an English first attempt, or a question…"
              }
            />
            <div className="button-row">
              <button className="primary" type="submit" disabled={busy || !answer.trim()}>
                {busy ? "Coach is thinking…" : "Send →"}
              </button>
              <button type="button" disabled={busy} onClick={() => void deal()}>
                ⤨ Shuffle the situation
              </button>
            </div>
          </form>
          <details>
            <summary>Give me a lifeline</summary>
            <div className="coach-lifeline">
              <strong lang="zh-CN">{scene.target.hanzi}</strong>
              <p>
                {scene.target.pinyin} · {scene.target.english}
              </p>
              <p>{scene.target.tip}</p>
            </div>
          </details>
          {scene.target.kind === "phrase" && (
            <details>
              <summary>Rather say it? Record your reply</summary>
              <VoicePractice
                key={scene.id}
                text={scene.target.hanzi}
                missionId={mission.id}
                onTranscript={setAnswer}
              />
            </details>
          )}
        </>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        Fictional crew scenarios. Replies and recent context go to the AI provider; not your Google
        account details. AI feedback is practice—not a mastery stamp, a tone score, or emergency
        advice. Emergency numbers are checked by code, not invented by the model.
      </p>
    </section>
  );
}
