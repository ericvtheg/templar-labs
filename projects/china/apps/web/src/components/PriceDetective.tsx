import { useState } from "react";
import { useEncounterFocus } from "../lib/use-encounter-focus.ts";
import { SpeechPlayer } from "./SpeechPlayer.tsx";
export function PriceDetective({ onComplete }: { onComplete?: () => void } = {}) {
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const puzzles = [
    { unit: 35, quantity: 3, item: "souvenir fans", label: "单价", meaning: "unit price" },
    { unit: 80, quantity: 4, item: "tickets", label: "每人", meaning: "per person" },
    { unit: 28, quantity: 2, item: "portions of dumplings", label: "每份", meaning: "per portion" },
  ] as const;
  const puzzle = puzzles[round % puzzles.length] ?? puzzles[0];
  const total = puzzle.unit * puzzle.quantity;
  const correct = answer.trim() !== "" && Number(answer) === total;
  const screen = useEncounterFocus(String(checked && correct));
  if (onComplete && checked && correct) {
    return (
      <section ref={screen} className="price-detective serial-success">
        <span className="eyebrow">NO PRICE SURPRISES</span>
        <h2>You checked the unit, not just the number.</h2>
        <p>
          {puzzle.quantity} × ¥{puzzle.unit} = ¥{total}. That’s the total to confirm before paying.
        </p>
        <button type="button" className="primary" onClick={onComplete}>
          What happens next? →
        </button>
      </section>
    );
  }
  return (
    <section ref={screen} className="price-detective">
      <span className="eyebrow">THE PRICE DETECTIVE · EXAMPLE PRICES, NOT LIVE QUOTES</span>
      <h3>Good price—or wrong unit?</h3>
      <div className="receipt">
        <div>小票 · PRACTICE RECEIPT</div>
        <p>
          The crew wants{" "}
          <strong>
            {puzzle.quantity} {puzzle.item}
          </strong>
          .
        </p>
        <div className="receipt-line">
          <strong lang="zh-CN">{puzzle.label}</strong>
          <b>¥{puzzle.unit}</b>
        </div>
        <div className="receipt-line">
          <span>数量 · quantity</span>
          <b>× {puzzle.quantity}</b>
        </div>
        <div className="receipt-total">
          <strong>总价 · total</strong>
          <b>¥ ?</b>
        </div>
      </div>
      <p>
        The posted figure is <strong>{puzzle.meaning}</strong>, not the entire crew’s total. No
        unlisted fees in this practice example.
      </p>
      <SpeechPlayer text={`${puzzle.label}。`} />
      <fieldset className="encounter-choices" aria-label="What total would you agree to pay?">
        <legend>What total would you agree to pay?</legend>
        {[puzzle.unit, total, puzzle.unit * (puzzle.quantity + 1)]
          .toSorted((a, b) => a - b)
          .map((price) => (
            <button
              key={price}
              type="button"
              aria-pressed={answer === String(price)}
              onClick={() => {
                setAnswer(String(price));
                setChecked(true);
              }}
            >
              ¥{price}
            </button>
          ))}
      </fieldset>
      {checked && (
        <div role="status" className={correct ? "success-note" : "notice"}>
          {correct
            ? `Exactly: ${puzzle.quantity} × ¥${puzzle.unit} = ¥${total}. You checked the unit before agreeing to the price.`
            : `Try ${puzzle.quantity} × ${puzzle.unit}. The sign is ${puzzle.meaning}; the total is ¥${total}. A unit misunderstanding is not automatically a scam.`}
        </div>
      )}
      {!onComplete && (
        <button
          type="button"
          onClick={() => {
            setRound(round + 1);
            setAnswer("");
            setChecked(false);
          }}
        >
          Another price situation ⤨
        </button>
      )}
    </section>
  );
}
