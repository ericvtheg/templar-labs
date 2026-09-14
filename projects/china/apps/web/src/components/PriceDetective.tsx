import { useId, useState } from "react";
export function PriceDetective() {
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const id = useId();
  const puzzles = [
    { unit: 35, quantity: 3, item: "souvenir fans", label: "单价", meaning: "unit price" },
    { unit: 80, quantity: 4, item: "tickets", label: "每人", meaning: "per person" },
    { unit: 28, quantity: 2, item: "portions of dumplings", label: "每份", meaning: "per portion" },
  ];
  const puzzle = puzzles[round % puzzles.length];
  if (!puzzle) {
    return null;
  }
  const total = puzzle.unit * puzzle.quantity;
  const correct = answer.trim() !== "" && Number(answer) === total;
  return (
    <section className="price-detective">
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setChecked(true);
        }}
      >
        <label htmlFor={id}>What total should you confirm before paying? (yuan)</label>
        <input
          id={id}
          inputMode="decimal"
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value);
            setChecked(false);
          }}
          maxLength={12}
        />
        <button type="submit" className="primary" disabled={!answer.trim()}>
          Check the total →
        </button>
      </form>
      {checked && (
        <div role="status" className={correct ? "success-note" : "notice"}>
          {correct
            ? `Exactly: ${puzzle.quantity} × ¥${puzzle.unit} = ¥${total}. You checked the unit before agreeing to the price.`
            : `Try ${puzzle.quantity} × ${puzzle.unit}. The sign is ${puzzle.meaning}; the total is ¥${total}. A unit misunderstanding is not automatically a scam.`}
        </div>
      )}
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
    </section>
  );
}
