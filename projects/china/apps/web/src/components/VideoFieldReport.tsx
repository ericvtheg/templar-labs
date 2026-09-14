import { useId, useState } from "react";
import { restaurantVideo } from "../lib/activity-content.ts";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
export function VideoFieldReport({ ready }: { ready: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [report, setReport] = useState("");
  const [word, setWord] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  return (
    <section className="video-lab">
      <div className="encounter-label">
        <span>▣ OUTSIDE THE APP</span>
        <span>GIST, NOT TRANSLATION</span>
      </div>
      <h2>Can you catch anything in the wild?</h2>
      <p>
        No word-for-word translation. Watch 60–90 seconds of your choice and tell us the broad
        situation, plus one word or visual clue you recognized.
      </p>
      {!ready && (
        <div className="notice">
          This is a stretch challenge. We recommend learning hello and completing three missions
          first. You can still peek now—understanding one word counts as a start.
        </div>
      )}
      {fallback ? (
        <div className="radio-scene">
          <span className="eyebrow">APP-WRITTEN LISTENING SCENE · NOT THE VIDEO’S TRANSCRIPT</span>
          <h3>Someone is ordering lunch.</h3>
          <SpeechPlayer text={restaurantVideo.fallback} />
          <button type="button" onClick={() => setReveal(!reveal)}>
            {reveal ? "Hide the words" : "Give me a transcript lifeline"}
          </button>
          {reveal && (
            <div>
              <p lang="zh-CN">{restaurantVideo.fallback}</p>
              <p>{restaurantVideo.fallbackPinyin}</p>
              <p>{restaurantVideo.fallbackMeaning}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="video-screen">
          {loaded ? (
            <iframe
              title="Chinese dining vocabulary with Xiaonita"
              src={`https://www.youtube-nocookie.com/embed/${restaurantVideo.id}?rel=0`}
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button type="button" className="video-cover" onClick={() => setLoaded(true)}>
              <span aria-hidden="true">▶</span>
              <strong>Step into a real restaurant.</strong>
              <small>Load Chinese with Xiaonita’s YouTube video</small>
            </button>
          )}
        </div>
      )}
      <p className="fine-print">
        Video:{" "}
        <a
          href={`https://www.youtube.com/watch?v=${restaurantVideo.id}`}
          target="_blank"
          rel="noreferrer"
        >
          {restaurantVideo.title} · {restaurantVideo.creator}
        </a>
        . Chosen from the creator’s beginner-Chinese description; this app doesn’t claim a verified,
        timestamped transcript. Prefer Chinese captions; use English only as a lifeline. YouTube
        loads only after you tap and may be unavailable in mainland China.
      </p>
      <button
        type="button"
        onClick={() => {
          setFallback(!fallback);
          setSubmitted(false);
        }}
      >
        {fallback
          ? "Back to the real-world video"
          : "Video blocked? Try our original audio scene instead"}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
        }}
      >
        <label htmlFor={`${id}-gist`}>
          What was broadly happening? English is absolutely fine.
        </label>
        <textarea
          id={`${id}-gist`}
          value={report}
          onChange={(event) => {
            setReport(event.target.value);
            setSubmitted(false);
          }}
          rows={3}
          maxLength={600}
          placeholder="I think someone was ordering food. I caught…"
        />
        <label htmlFor={`${id}-word`}>One word, sound, or visual clue you noticed</label>
        <input
          id={`${id}-word`}
          value={word}
          onChange={(event) => {
            setWord(event.target.value);
            setSubmitted(false);
          }}
          maxLength={120}
          placeholder="Even ‘I heard ni hao’ is a start."
        />
        <button type="submit" className="primary" disabled={!report.trim() || !word.trim()}>
          Pin my field report →
        </button>
      </form>
      {submitted && (
        <div className="field-report" role="status">
          <span className="eyebrow">YOUR FIELD NOTE · SAVED IN THIS VIEW ONLY</span>
          <p>{report}</p>
          <strong>Clue: {word}</strong>
          <p>
            That’s a real first listening attempt—not a claim of fluency. Replay a small part and
            see whether your guess changes.
          </p>
          <details>
            <summary>Self-check the broad topic</summary>
            <p>
              {fallback
                ? "The speaker greets someone and asks for two portions of dumplings, not too spicy, then says thanks."
                : "The creator describes this as restaurant dining vocabulary and expressions. A broad restaurant/ordering-food summary is the goal—not an invented detailed transcript."}
            </p>
          </details>
        </div>
      )}
      <p className="fine-print">
        This is a private self-reflection, not an automatically verified video exam. Your report
        stays in this view and isn’t sent to an LLM. It does not award a false mastery stamp.
      </p>
    </section>
  );
}
