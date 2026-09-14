import { useState } from "react";
import type { TripHype } from "../lib/trip-hype.ts";
export function TripHypeCard({ facts }: { facts: TripHype[] }) {
  const [index, setIndex] = useState(0);
  const fact = facts[index];
  if (!fact) {
    return null;
  }
  return (
    <aside className="hype-card" aria-label="Why this trip is going to rule">
      <div className="hype-metric" aria-hidden="true">
        {fact.metric}
        <span>THIS IS ACTUALLY HAPPENING</span>
      </div>
      <div className="hype-copy">
        <span className="eyebrow">{fact.tag}</span>
        <h3>{fact.title}</h3>
        <p>{fact.fact}</p>
        <details key={index}>
          <summary>Why this trip is going to rule ↗</summary>
          <p className="hype-why">{fact.why}</p>
          <p>
            <strong>Put it on the shortlist:</strong> {fact.tryIt}
          </p>
          {fact.caveat && <p className="fine-print">{fact.caveat}</p>}
          <div className="hype-sources">
            <span>Sources checked September 2026 · </span>
            {[fact.source, fact.extraSource]
              .filter((source) => source !== undefined)
              .map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.label} ↗
                </a>
              ))}
          </div>
        </details>
        {facts.length > 1 && (
          <button
            type="button"
            className="text-button"
            onClick={() => setIndex((index + 1) % facts.length)}
          >
            Another reason to get on the plane →
          </button>
        )}
      </div>
    </aside>
  );
}
