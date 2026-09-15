import { useState } from "react";
import type { Mission, Phrase } from "../lib/curriculum.ts";
import { type EncounterFormat, sessionPlan } from "../lib/session-plan.ts";
import { tripApi } from "../lib/trip-api.ts";
import type { AnswerResult, Mastery } from "../lib/types.ts";
import { useEncounterFocus } from "../lib/use-encounter-focus.ts";
import { ChaosCoach } from "./ChaosCoach.tsx";
import { HelloPrimer } from "./HelloPrimer.tsx";
import { PriceDetective } from "./PriceDetective.tsx";
import { SignMatching, shuffled } from "./SignMatching.tsx";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
import { VideoFieldReport } from "./VideoFieldReport.tsx";
import { VoicePractice } from "./VoicePractice.tsx";

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
  // Freeze the itinerary for this visit. Saving an answer must not shift the step under the learner.
  const [steps] = useState(() => sessionPlan(mission, mastery, completed));
  const [index, setIndex] = useState(0);
  const [stamped, setStamped] = useState(completed);
  const screen = useEncounterFocus(index);
  const step = steps[index];
  if (!step) {
    return null;
  }
  const next = () => setIndex((current) => Math.min(current + 1, steps.length - 1));
  const fact = mission.hype?.[0];
  return (
    <article className="mission-experience serial-session">
      <header className="session-bar">
        <button type="button" className="text-button" onClick={onBack}>
          ← Leave session
        </button>
        <span>
          {mission.city} · {index + 1} / {steps.length}
        </span>
      </header>
      <progress
        className="session-progress"
        max={steps.length}
        value={index + 1}
        aria-label="Session progress"
      />
      <section
        ref={screen}
        className="session-screen"
        tabIndex={-1}
        aria-label="Current encounter"
        key={step.id}
      >
        {step.kind === "intro" && (
          <section className="session-intro">
            <span className="eyebrow">ONE CHAPTER. ONE THING AT A TIME.</span>
            <div className="session-art" aria-hidden="true">
              {mission.id === "basics" ? "你好" : mission.icon}
            </div>
            <h1>{mission.id === "basics" ? "Your first Chinese words." : mission.title}</h1>
            <p>
              {mission.id === "basics"
                ? "No alphabet knowledge. No guessing at mysterious characters. Start with two shapes, hear what they do, then use them."
                : `${mission.story
                    .split(/(?<=[.!?])\s+/)
                    .slice(0, 2)
                    .join(" ")}`}
            </p>
            <button type="button" className="primary" onClick={next}>
              {completed ? "Replay this chapter →" : "Let’s begin →"}
            </button>
            <small>
              {completed
                ? "Practice again without farming extra stamps."
                : "Correct answers save as you go. You can leave and continue later."}
            </small>
          </section>
        )}
        {step.kind === "foundations" && <HelloPrimer onComplete={next} />}
        {step.kind === "phrase" && mission.phrases[step.task] && (
          <PhraseEncounter
            phrase={mission.phrases[step.task] as Phrase}
            phrases={mission.phrases}
            format={step.format}
            missionId={mission.id}
            task={step.task}
            onSaved={async (result) => {
              if (result.completed) {
                setStamped(true);
              }
              await onRefresh();
            }}
            onNext={next}
          />
        )}
        {step.kind === "signs" && (
          <SignMatching
            cards={mission.matches ?? []}
            missionId={mission.id}
            onSaved={async () => {
              await onRefresh();
            }}
            onContinue={next}
          />
        )}
        {step.kind === "prices" && <PriceDetective onComplete={next} />}
        {step.kind === "coach" && <ChaosCoach mission={mission} onContinue={next} />}
        {step.kind === "video" && (
          <>
            <VideoFieldReport ready={completedCount >= 3} onComplete={next} />
            <button type="button" className="session-skip text-button" onClick={next}>
              Save the video for another day →
            </button>
          </>
        )}
        {step.kind === "payoff" && (
          <section className="session-payoff">
            <span className="eyebrow">THAT’S A REAL STEP FORWARD</span>
            <div className="session-art" aria-hidden="true">
              ✦
            </div>
            <h1>{stamped || completed ? "Passport stamped." : "A little less helpless."}</h1>
            <p>
              {mission.id === "basics"
                ? "You can recognize 你 and 好, say hello, and use a few polite words. That’s where a language starts—not with memorizing a dictionary."
                : "You’ve worked through this chapter’s words and signs. Next time, try using a line before reaching for the phone."}
            </p>
            {fact && (
              <div className="session-reveal">
                <span className="eyebrow">AND HERE’S WHY IT’S WORTH IT</span>
                <strong>{fact.metric}</strong>
                <h2>{fact.title}</h2>
                <p>{fact.fact}</p>
                <details>
                  <summary>The trip payoff & sources</summary>
                  <p>{fact.why}</p>
                  <p>{fact.tryIt}</p>
                  {fact.caveat && <p className="fine-print">{fact.caveat}</p>}
                  {[fact.source, fact.extraSource]
                    .filter((source) => source !== undefined)
                    .map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        {source.label} ↗
                      </a>
                    ))}
                </details>
              </div>
            )}
            <button type="button" className="primary" onClick={onBack}>
              Back to your trip →
            </button>
            <p className="fine-print">
              Your saved word practice returns for spaced review. AI conversations and video
              reflections aren’t fake proficiency scores.
            </p>
          </section>
        )}
      </section>
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
}: {
  phrase: Phrase;
  phrases: Phrase[];
  format: EncounterFormat;
  missionId: string;
  task: number;
  onSaved: (result: AnswerResult) => Promise<void>;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState<"learn" | "try" | "feedback">("learn");
  const [flipped, setFlipped] = useState(false);
  const [choices] = useState(() => shuffled(phrases));
  const [tapInstead, setTapInstead] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const screen = useEncounterFocus(phase);
  async function submit(value: string) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await tripApi<AnswerResult>("answer", { missionId, task, answer: value });
      setResult(response);
      setPhase("feedback");
      await onSaved(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save that attempt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section ref={screen} className={`phrase-encounter serial-phrase ${format}`}>
      <span className="eyebrow">
        {phase === "learn"
          ? "ONE USEFUL LINE"
          : phase === "feedback"
            ? "MAKE IT STICK"
            : format === "ears"
              ? "LET YOUR EARS DO IT"
              : format === "voice"
                ? "YOUR TURN TO SPEAK"
                : "TRY FROM MEMORY"}
      </span>
      <h2>
        {phase === "feedback"
          ? result?.correct
            ? "That gets the message across."
            : "Here’s the line. Have another go."
          : phase === "try" && format === "ears"
            ? "What did you hear?"
            : phrase.english}
      </h2>
      {phase === "learn" && (
        <>
          {format === "cards" ? (
            <button
              type="button"
              className={`flip-card ${flipped ? "flipped" : ""}`}
              aria-label="Flip phrase card"
              onClick={() => setFlipped(!flipped)}
            >
              {flipped ? (
                <>
                  <strong lang="zh-CN">{phrase.hanzi}</strong>
                  <span>{phrase.pinyin}</span>
                  <small>{phrase.tip}</small>
                </>
              ) : (
                <>
                  <strong>{phrase.english}</strong>
                  <span>Flip it. Meet the Chinese.</span>
                </>
              )}
            </button>
          ) : (
            <div className="phrase-introduction">
              <strong lang="zh-CN">{phrase.hanzi}</strong>
              <p>{phrase.pinyin}</p>
              <p>{phrase.tip}</p>
            </div>
          )}
          <SpeechPlayer text={phrase.hanzi} />
          {(flipped || format !== "cards") && (
            <>
              <button type="button" className="primary" onClick={() => setPhase("try")}>
                {format === "ears"
                  ? "Try it by ear →"
                  : format === "voice"
                    ? "My turn to say it →"
                    : "Try it from memory →"}
              </button>
            </>
          )}
        </>
      )}
      {phase === "try" && (
        <>
          {format === "ears" && (
            <>
              <div className="listening-orbit" aria-hidden="true">
                <span>◖</span>
                <i />
                <i />
              </div>
            </>
          )}
          {format !== "voice" && <SpeechPlayer text={phrase.hanzi} />}
          {format === "voice" && !tapInstead ? (
            <>
              <p>
                Say it like you’re asking someone on the street. Record your reply, then check what
                you said.
              </p>
              <VoicePractice
                text={phrase.hanzi}
                missionId={missionId}
                onTranscript={(text) => void submit(text)}
              />
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setTapInstead(true)}
              >
                No microphone? Pick what you’d say instead →
              </button>
            </>
          ) : (
            <div className="encounter-choices">
              {format === "voice" && <SpeechPlayer text={phrase.hanzi} />}
              {choices.map((choice) => (
                <button
                  type="button"
                  key={choice.hanzi}
                  disabled={busy}
                  onClick={() => void submit(choice.hanzi)}
                >
                  {format === "ears" ? (
                    choice.english
                  ) : (
                    <>
                      <strong lang="zh-CN">{choice.hanzi}</strong>
                      <small>{choice.pinyin}</small>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
          <details>
            <summary>Give me a lifeline</summary>
            <strong lang="zh-CN">{phrase.hanzi}</strong>
            <p>
              {phrase.pinyin} · {phrase.english}
            </p>
            <p>{phrase.tip}</p>
          </details>
        </>
      )}
      {phase === "feedback" && (
        <div className={`serial-feedback ${result?.correct ? "correct" : ""}`}>
          <strong lang="zh-CN">{phrase.hanzi}</strong>
          <p>
            {phrase.pinyin} — {phrase.english}
          </p>
          <SpeechPlayer text={phrase.hanzi} />
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={result?.correct ? onNext : () => setPhase("learn")}
          >
            {busy ? "Saving…" : result?.correct ? "What happens next? →" : "Let’s try again →"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </section>
  );
}
