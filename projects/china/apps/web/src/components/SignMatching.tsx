import { useState } from "react";
import type { MatchCard } from "../lib/activity-content.ts";
import { tripApi } from "../lib/trip-api.ts";
import type { AnswerResult } from "../lib/types.ts";
import { PriceDetective } from "./PriceDetective.tsx";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}
export function SignMatching({
  cards,
  missionId,
  onSaved,
}: {
  cards: MatchCard[];
  missionId: string;
  onSaved: () => Promise<void>;
}) {
  const [playing, setPlaying] = useState(false);
  const [order, setOrder] = useState(() => shuffled(cards));
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [audition, setAudition] = useState<MatchCard | null>(null);
  function start() {
    setPlaying(true);
    setMatched([]);
    setSelected(null);
    setMessage("");
    setSaved(false);
    setOrder(shuffled(cards));
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await tripApi<AnswerResult>("match", {
        missionId,
        pairs: cards.map((card) => ({ id: card.id, english: card.english })),
      });
      if (!result.correct) {
        throw new Error("The matching deck changed. Reload this lesson and try the new signs.");
      }
      setSaved(true);
      setMessage("You can read the room. Literally. Sign encounter saved.");
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn’t save your matches.");
    } finally {
      setBusy(false);
    }
  }
  function match(english: string, id = selected) {
    if (!id || matched.includes(id)) {
      setMessage("Choose a Chinese sign first, then its meaning.");
      return;
    }
    const card = cards.find((item) => item.id === id);
    if (card?.english !== english) {
      setMessage(
        "Not that pair. Look at the shapes, take another guess, or peek at the sign wall. No timer, no lost hearts.",
      );
      setSelected(null);
      return;
    }
    const next = [...matched, id];
    setMatched(next);
    setSelected(null);
    setMessage(`${card.hanzi} = ${card.english}. Connected.`);
    if (next.length === cards.length) {
      void save();
    }
  }
  return (
    <section className="matching-lab">
      <div className="encounter-label">
        <span>◈ SIGNS ON THE STREET</span>
        <span>
          {playing ? `${matched.length} / ${cards.length} CONNECTED` : "LOOK BEFORE YOU GUESS"}
        </span>
      </div>
      <h2>Read the room. Find the way out.</h2>
      <p>
        These shapes actually mean something. Learn the sign wall first; then match Chinese to
        English. Tap works on phones. You can drag signs on desktop.
      </p>
      {!playing ? (
        <>
          <div className="sign-wall">
            {cards.map((card) => (
              <button
                type="button"
                key={card.id}
                className={`street-sign ${card.color}`}
                onClick={() => setAudition(card)}
              >
                <strong lang="zh-CN">{card.hanzi}</strong>
                <span>{card.pinyin}</span>
                <b>
                  {card.english} {card.color === "green" ? "↗" : ""}
                </b>
              </button>
            ))}
          </div>
          {audition && (
            <SpeechPlayer key={audition.id} text={audition.audio ?? `${audition.hanzi}。`} />
          )}
          <button type="button" className="primary" onClick={start}>
            Hide the English. Let me match →
          </button>
        </>
      ) : (
        <>
          <div className="match-board">
            <fieldset aria-label="Chinese signs">
              {cards.map((card) => (
                <button
                  type="button"
                  draggable={!matched.includes(card.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", card.id);
                    setSelected(card.id);
                  }}
                  key={card.id}
                  className={`match-sign ${card.color} ${matched.includes(card.id) ? "matched" : ""}`}
                  aria-pressed={selected === card.id}
                  disabled={matched.includes(card.id) || busy}
                  onClick={() => {
                    setSelected(card.id);
                    setMessage("");
                  }}
                >
                  <strong lang="zh-CN">{card.hanzi}</strong>
                  {matched.includes(card.id) && <span>✓ {card.english}</span>}
                </button>
              ))}
            </fieldset>
            <fieldset aria-label="English meanings">
              {order.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className={`meaning-card ${matched.includes(card.id) ? "matched" : ""}`}
                  disabled={matched.includes(card.id) || busy}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    match(card.english, event.dataTransfer.getData("text/plain"));
                  }}
                  onClick={() => match(card.english)}
                >
                  {matched.includes(card.id) ? "✓ " : ""}
                  {card.english}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setAudition(null);
              }}
            >
              Peek at the sign wall
            </button>
            {saved && (
              <button type="button" onClick={start}>
                Shuffle & play again
              </button>
            )}
            {matched.length === cards.length && !saved && (
              <button type="button" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Retry saving matches"}
              </button>
            )}
          </div>
        </>
      )}
      {message && (
        <p role="status" className={saved ? "success-note" : "notice"}>
          {message}
        </p>
      )}
      {missionId === "market" && <PriceDetective />}
    </section>
  );
}
