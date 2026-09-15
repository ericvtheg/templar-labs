import { useEffect, useRef, useState } from "react";
import type { CoachReply, CoachScene } from "../lib/coach-types.ts";
import type { Mission } from "../lib/curriculum.ts";
import { tripApi } from "../lib/trip-api.ts";
import { useEncounterFocus } from "../lib/use-encounter-focus.ts";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
import { VoicePractice } from "./VoicePractice.tsx";
export function ChaosCoach({
  mission,
  focus,
  onContinue,
}: {
  mission: Mission;
  focus?: number;
  onContinue?: () => void;
}) {
  const [scene, setScene] = useState<CoachScene | null>(null);
  const [messages, setMessages] = useState<{ id: string; role: "you" | "coach"; text: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [won, setWon] = useState(false);
  const screen = useEncounterFocus(`${scene?.id ?? "empty"}:${won}`);
  const controller = useRef<AbortController | null>(null);
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
  async function send(answer: string) {
    if (!scene || busy || !answer.trim()) {
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
  if (won && onContinue) {
    return (
      <section ref={screen} className="chaos-lab serial-success">
        <span className="eyebrow">SITUATION HANDLED</span>
        <h2>You got the message across.</h2>
        <p>{messages.at(-1)?.text}</p>
        {scene?.target.kind === "phrase" && <SpeechPlayer text={scene.target.hanzi} />}
        <button type="button" className="primary" onClick={onContinue}>
          What happens next? →
        </button>
        <button type="button" className="text-button session-skip" onClick={() => setWon(false)}>
          I have a follow-up question
        </button>
        <p className="fine-print">AI practice feedback, not a pronunciation score.</p>
      </section>
    );
  }
  return (
    <section ref={screen} className="chaos-lab">
      <div className="encounter-label">
        <span>✦ LIVE FIELD TEST</span>
        <span>SPEAK OR TAP</span>
      </div>
      <h2>The boys in the wild.</h2>
      <p>
        Same useful Mandarin. A different fucking situation. Say what you’d say to the person in
        front of you—or tap a phrase you could show them.
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
          {scene.target.kind === "emergency" ? (
            <fieldset className="encounter-choices">
              <legend>Which number would you call?</legend>
              {["120", "110", "119"].map((number) => (
                <button
                  key={number}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(number)}
                >
                  {number}
                </button>
              ))}
            </fieldset>
          ) : (
            <>
              {!busy && (
                <VoicePractice
                  key={`${scene.id}-${messages.length}`}
                  text={scene.target.hanzi}
                  missionId={mission.id}
                  onTranscript={(text) => void send(text)}
                />
              )}
              <details>
                <summary>Pick a reply to say or show instead</summary>
                <div className="encounter-choices">
                  {mission.phrases.map((phrase) => (
                    <button
                      key={phrase.hanzi}
                      type="button"
                      disabled={busy}
                      aria-label={`Say: ${phrase.english}`}
                      onClick={() => void send(phrase.hanzi)}
                    >
                      <strong lang="zh-CN">{phrase.hanzi}</strong>
                      <span>
                        {phrase.pinyin} · {phrase.english}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            </>
          )}
          {busy && <p role="status">Listening to your reply…</p>}
          <details>
            <summary>Ask for help</summary>
            <div className="button-row">
              {["What does this mean?", "How do I say that?", "When would I use this?"].map(
                (question) => (
                  <button
                    key={question}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(question)}
                  >
                    {question}
                  </button>
                ),
              )}
            </div>
          </details>
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
        </>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {onContinue && (
        <button type="button" className="session-skip text-button" onClick={onContinue}>
          Finish without the AI practice this time →
        </button>
      )}
      <p className="fine-print">
        Fictional crew scenarios. Replies and recent context go to the AI provider; not your Google
        account details. AI feedback is practice—not a mastery stamp, a tone score, or emergency
        advice. Emergency numbers are checked by code, not invented by the model.
      </p>
    </section>
  );
}
