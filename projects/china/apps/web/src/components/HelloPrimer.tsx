import { useState } from "react";
import { useEncounterFocus } from "../lib/use-encounter-focus.ts";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
import { VoicePractice } from "./VoicePractice.tsx";

const pieces = [
  {
    text: "你。",
    char: "你",
    pinyin: "nǐ",
    meaning: "you",
    sound:
      "Roughly ‘nee’—one syllable. The mark over ǐ tells you the pitch movement, not a different vowel.",
  },
  {
    text: "好。",
    char: "好",
    pinyin: "hǎo",
    meaning: "good",
    sound:
      "Roughly ‘how’—one smooth syllable, not ‘ha-oh’. English approximations are training wheels; copy the audio.",
  },
  {
    text: "你好。",
    char: "你好",
    pinyin: "nǐ hǎo",
    meaning: "hello",
    sound:
      "Together: ‘you + good’ is a greeting. Natural speech sounds like ní hǎo because two third tones meet. Listen to the complete phrase, not just the isolated pieces.",
  },
];
export function HelloPrimer({ onComplete }: { onComplete?: () => void } = {}) {
  const [step, setStep] = useState(0);
  const [piece, setPiece] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const screen = useEncounterFocus(step);
  const selected = pieces[piece] ?? pieces[0];
  if (!selected) {
    return null;
  }
  return (
    <section ref={screen} className="primer hello-lab">
      <span className="eyebrow">CHINESE, FROM LITERALLY ZERO</span>
      <h2>
        {onComplete
          ? [
              "Two shapes, one greeting.",
              "Hear them come together.",
              "Your voice changes the word.",
              "One tiny win.",
            ][step]
          : "Start here: what the hell is 你好?"}
      </h2>
      {!onComplete && <p>Let’s turn two unfamiliar shapes into something you can actually say.</p>}
      {onComplete ? (
        <p className="foundation-counter">
          {step + 1} / 4 · {["See it", "Hear it", "Move your voice", "Try it"][step]}
        </p>
      ) : (
        <fieldset className="lab-steps" aria-label="Chinese foundations">
          {["See it", "Hear it", "Move your voice", "Try it"].map((label, index) => (
            <button
              type="button"
              key={label}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
            >
              <b>{index + 1}</b>
              {label}
            </button>
          ))}
        </fieldset>
      )}
      {step === 0 && (
        <>
          {!onComplete && <h3>Two characters. Read left → right.</h3>}
          <div className="character-equation">
            <div>
              <strong lang="zh-CN">你</strong>
              <span>nǐ</span>
              <b>you</b>
            </div>
            <span>+</span>
            <div>
              <strong lang="zh-CN">好</strong>
              <span>hǎo</span>
              <b>good</b>
            </div>
            <span>=</span>
            <div>
              <strong lang="zh-CN">你好</strong>
              <span>nǐ hǎo</span>
              <b>hello</b>
            </div>
          </div>
          {onComplete && (
            <p>
              Read left → right. The big symbols are <strong>characters</strong>. The smaller
              letters are <strong>pinyin</strong>: a guide to saying them.
            </p>
          )}
          <details open={!onComplete}>
            <summary>How does Chinese writing work?</summary>
            <p>
              A <strong>character</strong> is a written symbol. Each of these has one spoken
              syllable and its own meaning. Characters are not English letters, and a word can
              contain more than one character.
            </p>
            <p>
              <strong>Pinyin</strong> is the Latin-letter pronunciation guide underneath:{" "}
              <strong>nǐ hǎo</strong>. You do not need to know how to handwrite 你 to recognize it
              or say hello.
            </p>
            <div className="notice">
              For this trip, start with <strong>recognizing useful shapes</strong>: restroom, exit,
              entrance, food. Not memorizing an entire writing system.
            </div>
          </details>
        </>
      )}
      {step === 1 && (
        <>
          <h3>Tap a piece. Hear what it does.</h3>
          <div className="character-picker">
            {pieces.map((item, index) => (
              <button
                type="button"
                key={item.text}
                aria-pressed={piece === index}
                onClick={() => setPiece(index)}
              >
                <span lang="zh-CN">{item.char}</span>
                <small>{item.meaning}</small>
              </button>
            ))}
          </div>
          <div className="sound-focus">
            <strong lang="zh-CN">{selected.char}</strong>
            <p lang="zh-Latn-pinyin">{selected.pinyin}</p>
            <p>{selected.sound}</p>
            <SpeechPlayer key={selected.text} text={selected.text} />
          </div>
          <p className="fine-print">
            Play each character once, then 你好 twice. The full greeting is the version you’ll
            actually use.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          {!onComplete && <h3>Your voice changes the word.</h3>}
          <p>
            The little marks are <strong>tones</strong>: the pitch pattern of a syllable. Not
            shouting, not English word stress. Copy the voice’s movement.
          </p>
          {!onComplete && (
            <div className="tones">
              {[
                ["ā", "→", "high & level"],
                ["á", "↗", "rising"],
                ["ǎ", "⌄", "low / dipping"],
                ["à", "↘", "falling"],
                ["a", "·", "light / neutral"],
              ].map(([syllable, shape, label]) => (
                <div key={label}>
                  <strong>{syllable}</strong>
                  <span>{shape}</span>
                  <small>{label}</small>
                </div>
              ))}
            </div>
          )}
          <div className="tone-change">
            <span>
              Written
              <br />
              <strong>nǐ hǎo</strong>
            </span>
            <b>→</b>
            <span>
              What you hear
              <br />
              <strong>ní hǎo</strong>
            </span>
          </div>
          {onComplete && (
            <p>
              Let the first syllable rise, then say the second low. Copy the audio—you don’t need a
              whole tone chart yet.
            </p>
          )}
          <details>
            <summary>Why does the first tone change?</summary>
            <p>
              Both written marks are third tones. When they sit together,{" "}
              <strong>the first one rises</strong>. The second stays low and can dip/rise when said
              on its own. In fast speech, third tones are often just low—don’t force a theatrical
              scoop into every syllable.
            </p>
          </details>
          <SpeechPlayer text="你好。" />
          <details>
            <summary>Want to hear why tone matters? Try the “ma” lab.</summary>
            <ToneLab />
          </details>
        </>
      )}
      {step === 3 && (
        <>
          <h3>One tiny win. Then take it outside.</h3>
          <p>
            Which character means <strong>you</strong>?
          </p>
          <div className="character-picker">
            {["你", "好"].map((char) => (
              <button type="button" key={char} onClick={() => setAnswer(char)}>
                <span lang="zh-CN">{char}</span>
              </button>
            ))}
          </div>
          {answer && (
            <p role="status" className="notice">
              {answer === "你"
                ? "Yes. 你 = you. You just read your first Chinese character."
                : "好 means good. Try the other character—there’s no penalty."}
            </p>
          )}
          <details>
            <summary>Try saying it too (optional)</summary>
            <button type="button" className="text-button" onClick={() => setHidden(!hidden)}>
              {hidden ? "Show hello again" : "Hide the answer & say hello"}
            </button>
            <div className={`primer-example ${hidden ? "concealed" : ""}`} aria-hidden={hidden}>
              <span lang="zh-CN">你好</span>
              <strong>nǐ hǎo → sounds like ní hǎo</strong>
              <small>Hello</small>
            </div>
            <VoicePractice text="你好。" />
            <p>
              Listen. Say it. Listen to yourself. That’s enough for a first step. Next, we’ll turn
              signs like <span lang="zh-CN">出口</span> into things you can recognize on the street.
            </p>
          </details>
        </>
      )}
      <div className="button-row spread">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>
          ← Back
        </button>
        {step < 3 ? (
          <button type="button" className="primary" onClick={() => setStep(step + 1)}>
            Next: {["", "hear it", "tones", "try it"][step + 1]} →
          </button>
        ) : onComplete ? (
          <button type="button" className="primary" disabled={answer !== "你"} onClick={onComplete}>
            Use your first words →
          </button>
        ) : (
          <span className="eyebrow">NOW TRY A MISSION ENCOUNTER BELOW ↓</span>
        )}
      </div>
    </section>
  );
}
function ToneLab() {
  const [index, setIndex] = useState(0);
  const tones = [
    { char: "妈", pinyin: "mā", meaning: "mother" },
    { char: "麻", pinyin: "má", meaning: "hemp / numb" },
    { char: "马", pinyin: "mǎ", meaning: "horse" },
    { char: "骂", pinyin: "mà", meaning: "scold" },
  ];
  const tone = tones[index];
  if (!tone) {
    return null;
  }
  return (
    <div>
      <p>
        Same “ma” syllable, different pitch, different meaning. You don’t need to memorize these
        words today—just hear the contrast.
      </p>
      <div className="character-picker">
        {tones.map((item, i) => (
          <button
            type="button"
            key={item.char}
            aria-pressed={index === i}
            onClick={() => setIndex(i)}
          >
            <span>{item.pinyin}</span>
            <small>{item.meaning}</small>
          </button>
        ))}
      </div>
      <SpeechPlayer key={tone.char} text={`${tone.char}。`} />
    </div>
  );
}
