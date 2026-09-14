import { useId, useState } from "react";
import type { Mission, Phrase } from "../lib/curriculum.ts";
import { tripApi } from "../lib/trip-api.ts";
import type { AnswerResult, Mastery } from "../lib/types.ts";
import { ChaosCoach } from "./ChaosCoach.tsx";
import { HelloPrimer } from "./HelloPrimer.tsx";
import { SignMatching, shuffled } from "./SignMatching.tsx";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
import { TripHypeCard } from "./TripHypeCard.tsx";
import { VideoFieldReport } from "./VideoFieldReport.tsx";
import { VoicePractice } from "./VoicePractice.tsx";

type Format = "cards" | "ears" | "voice";
type View = "phrases" | "signs" | "chaos" | "video";
const formats = [
  { id: "cards" as const, icon: "▱", label: "Flip & recall" },
  { id: "ears" as const, icon: "◖", label: "Ears only" },
  { id: "voice" as const, icon: "●", label: "Say it" },
];
export function MissionExperience({
  mission,
  mastery,
  completed,
  completedCount,
  onBack,
  onRefresh,
}: {
  mission: Mission;
  mastery: Mastery[];
  completed: boolean;
  completedCount: number;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const learned = new Set(
    mastery
      .filter((item) => item.mission_id === mission.id && item.level > 0)
      .map((item) => item.task),
  );
  const initial = Math.max(
    0,
    mission.phrases.findIndex((_, index) => !learned.has(index)),
  );
  const [task, setTask] = useState(initial);
  const [format, setFormat] = useState<Format>(formats[initial % 3]?.id ?? "cards");
  const [view, setView] = useState<View>("phrases");
  const [foundation, setFoundation] = useState(mission.id === "basics" && !completed);
  const [stamp, setStamp] = useState(false);
  const phrase = mission.phrases[task];
  function next() {
    const nextTask = mission.phrases.findIndex((_, index) => index !== task && !learned.has(index));
    if (nextTask < 0) {
      setView("signs");
      return;
    }
    setTask(nextTask);
    setFormat(formats[nextTask % 3]?.id ?? "cards");
  }
  return (
    <article className="mission-experience">
      <button type="button" className="text-button" onClick={onBack}>
        ← Back to the missions
      </button>
      <header className="experience-header">
        <div>
          <span className="eyebrow">
            {mission.city} · {mission.label}
          </span>
          <h1>{mission.title}</h1>
        </div>
        <span className="experience-emblem" aria-hidden="true">
          {mission.icon}
        </span>
      </header>
      <details className="scene-setting">
        <summary className="eyebrow">THE SITUATION · WHAT HAVE THE BOYS DONE NOW?</summary>
        <p>{mission.story}</p>
      </details>
      <div className="encounter-progress">
        <span>
          {completed
            ? "✓ Passport stamp earned"
            : `${learned.size} / ${mission.phrases.length + 1} recall & sign encounters explored correctly`}
        </span>
        <div>
          {[...mission.phrases.map((item) => item.hanzi), "signs"].map((marker, index) => (
            <span
              key={marker}
              className={learned.has(index) ? "done" : ""}
              title={index === mission.phrases.length ? "Sign matching" : `Phrase ${index + 1}`}
            />
          ))}
        </div>
      </div>
      {mission.id === "basics" && (
        <>
          <button
            type="button"
            className="foundation-toggle"
            aria-expanded={foundation}
            onClick={() => setFoundation(!foundation)}
          >
            {foundation ? "−" : "+"} Start here: 你好, characters, sounds & tones
          </button>
          {foundation && <HelloPrimer />}
        </>
      )}
      <nav className="experience-nav" aria-label="Lesson encounters">
        {[
          ["phrases", "▱", "Phrase remix"],
          ["signs", "↗", "Match the signs"],
          ["chaos", "✦", "The boys in the wild"],
          ["video", "▶", "Real-world listening"],
        ].map(([id, icon, label]) => (
          <button
            type="button"
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => setView(id as View)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      {view === "phrases" && phrase && (
        <>
          <fieldset className="phrase-route" aria-label="Choose a phrase">
            {mission.phrases.map((item, index) => (
              <button
                type="button"
                key={item.hanzi}
                aria-pressed={task === index}
                onClick={() => {
                  setTask(index);
                  setFormat(formats[index % 3]?.id ?? "cards");
                }}
              >
                <b>{learned.has(index) ? "✓" : index + 1}</b>
                <span>{item.english}</span>
              </button>
            ))}
          </fieldset>
          <div className="remix-switch">
            <span className="eyebrow">CHANGE THE WAY YOU PLAY</span>
            <div className="button-row">
              {formats.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={format === item.id}
                  onClick={() => setFormat(item.id)}
                >
                  {item.icon} {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setFormat(
                    shuffled(formats.filter((item) => item.id !== format))[0]?.id ?? "cards",
                  )
                }
              >
                ⤨ Surprise me
              </button>
            </div>
          </div>
          <PhraseEncounter
            key={`${mission.id}-${task}-${format}`}
            phrase={phrase}
            phrases={mission.phrases}
            format={format}
            missionId={mission.id}
            task={task}
            onSaved={async (result) => {
              if (result.completed && !completed) {
                setStamp(true);
              }
              await onRefresh();
            }}
            onNext={next}
            onImprovise={() => setView("chaos")}
          />
        </>
      )}
      {view === "signs" && (
        <SignMatching
          key={mission.id}
          cards={mission.matches ?? []}
          missionId={mission.id}
          onSaved={onRefresh}
        />
      )}
      {view === "chaos" && <ChaosCoach key={mission.id} mission={mission} />}
      {view === "video" && <VideoFieldReport ready={completedCount >= 3} />}
      <TripHypeCard facts={mission.hype ?? []} />
      {(stamp || completed) && (
        <div className="passport-celebration">
          <span aria-hidden="true">✦ 已练习 ✦</span>
          <div>
            <h2>Passport stamped. Chaos still possible.</h2>
            <p>
              You’ve practiced the lesson’s phrases and signs. Real fluency takes repetition—come
              back for a remix, a fresh scenario, or your spaced review.
            </p>
          </div>
          <button type="button" className="primary" onClick={onBack}>
            Back to the trip →
          </button>
        </div>
      )}
      <p className="fine-print">
        Choose the order. Change the format. Core phrase recall + a sign encounter earn the stamp;
        AI conversation and real-world listening stretch the skill. Take a lifeline, try another
        format, and keep going.
      </p>
    </article>
  );
}
function PhraseEncounter({
  phrase,
  phrases,
  format,
  missionId,
  task,
  onSaved,
  onNext,
  onImprovise,
}: {
  phrase: Phrase;
  phrases: Phrase[];
  format: Format;
  missionId: string;
  task: number;
  onSaved: (result: AnswerResult) => Promise<void>;
  onNext: () => void;
  onImprovise: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [choices] = useState(() => shuffled(phrases));
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  async function submit(value: string) {
    setBusy(true);
    setError("");
    try {
      const response = await tripApi<AnswerResult>("answer", { missionId, task, answer: value });
      setResult(response);
      await onSaved(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save that attempt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`phrase-encounter ${format}`}>
      <div className="encounter-label">
        <span>
          {format === "cards"
            ? "▱ POCKET FLASHCARD"
            : format === "ears"
              ? "◖ YOUR EARS ARE DRIVING"
              : "● YOU’RE THE TRANSLATOR NOW"}
        </span>
        <span>PHRASE {task + 1}</span>
      </div>
      {format === "cards" && (
        <>
          <h2>Turn a meaning into a line you can use.</h2>
          <button
            type="button"
            className={`flip-card ${flipped ? "flipped" : ""}`}
            aria-label="Flip phrase card"
            onClick={() => setFlipped(!flipped)}
          >
            {flipped ? (
              <>
                <strong lang="zh-CN">{phrase.hanzi}</strong>
                <span lang="zh-Latn-pinyin">{phrase.pinyin}</span>
                <small>{phrase.tip}</small>
                <b>↻ Flip back</b>
              </>
            ) : (
              <>
                <small>YOU WANT TO SAY</small>
                <strong>{phrase.english}</strong>
                <span>Tap to reveal the Chinese, sound guide & meaning.</span>
                <b>↻ Flip me</b>
              </>
            )}
          </button>
          {flipped && <SpeechPlayer text={phrase.hanzi} />}
          <h3>Now pick the line you’d use.</h3>
          <p>{phrase.english}</p>
          <div className="encounter-choices">
            {choices.map((choice) => (
              <button
                type="button"
                key={choice.hanzi}
                disabled={busy}
                onClick={() => void submit(choice.hanzi)}
              >
                <strong lang="zh-CN">{choice.hanzi}</strong>
                <small>{choice.pinyin}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {format === "ears" && (
        <>
          <h2>No characters. Just your ears.</h2>
          <div className="listening-orbit" aria-hidden="true">
            <span>◖</span>
            <i />
            <i />
            <i />
          </div>
          <p>
            Listen to one of this lesson’s phrases. What did you hear? New to these words? The
            lifeline below is part of learning, not cheating.
          </p>
          <SpeechPlayer text={phrase.hanzi} />
          <div className="encounter-choices">
            {choices.map((choice) => (
              <button
                type="button"
                key={choice.hanzi}
                disabled={busy}
                onClick={() => void submit(choice.hanzi)}
              >
                {choice.english}
              </button>
            ))}
          </div>
          <details>
            <summary>First time? Show me the phrase before I guess</summary>
            <strong lang="zh-CN">{phrase.hanzi}</strong>
            <p>
              {phrase.pinyin} · {phrase.english}
            </p>
            <p>{phrase.tip}</p>
          </details>
        </>
      )}
      {format === "voice" && (
        <>
          <h2>Say it like someone needs to understand you.</h2>
          <div className="speaking-prompt">
            <span className="eyebrow">YOUR INTENTION</span>
            <strong>{phrase.english}</strong>
          </div>
          <details open>
            <summary>Your line & pronunciation lifeline</summary>
            <strong lang="zh-CN">{phrase.hanzi}</strong>
            <p>{phrase.pinyin}</p>
            <p>{phrase.tip}</p>
          </details>
          <VoicePractice text={phrase.hanzi} missionId={missionId} onTranscript={setAnswer} />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(answer);
            }}
          >
            <label htmlFor={inputId}>Check the transcript—or type Mandarin / pinyin instead</label>
            <input
              id={inputId}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={500}
              placeholder="No microphone? Pinyin works."
            />
            <button type="submit" className="primary" disabled={busy || !answer.trim()}>
              {busy ? "Checking…" : "Check my phrase →"}
            </button>
          </form>
          <p className="fine-print">
            This checks recognized words, not accent or tones. A speech recognizer can mishear you;
            edit its transcript before submitting.
          </p>
        </>
      )}
      {result && (
        <div
          className={result.correct ? "encounter-feedback correct" : "encounter-feedback"}
          role="status"
        >
          <h3>
            {result.correct
              ? "That gets the message across."
              : "Here’s the useful line. Try it again."}
          </h3>
          <strong lang="zh-CN">{phrase.hanzi}</strong>
          <p>
            {phrase.pinyin} — {phrase.english}
          </p>
          <p>{phrase.tip}</p>
          <div className="button-row">
            {result.correct && (
              <button className="primary" type="button" onClick={onNext}>
                Next encounter →
              </button>
            )}
            <button type="button" onClick={onImprovise}>
              Put the boys in a situation ✦
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
