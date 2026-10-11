import "./index.css";

import { Link } from "react-router";
import { type Version, type VersionId, versions } from "../content/pages.ts";
import { couple } from "../content/site.ts";
import { art } from "../shared/art.ts";
import { usePageTitle } from "../shared/hooks.ts";

const stems: Record<VersionId, string> = {
  v1: art.stemCosmos,
  v2: art.stemLily,
  v3: art.stemSunflower,
  v4: art.stemRose,
  v5: art.stemSprig,
};

const rounds = [
  { round: 2, label: "After Emma’s notes" },
  { round: 1, label: "First round" },
] as const;

function VersionCard({ version }: { version: Version }) {
  return (
    <li>
      <Link to={`/${version.id}`} className="index__card">
        <img className="index__stem" src={stems[version.id]} alt="" />
        <span className="index__number">{version.number}</span>
        <span className="index__name">{version.name}</span>
        <span className="index__blurb">{version.blurb}</span>
        <span className="index__open">
          Open <span aria-hidden="true">→</span>
        </span>
      </Link>
    </li>
  );
}

/** The root page: a chooser for the three design versions. */
export function IndexPage() {
  usePageTitle("Design versions");

  return (
    <main className="index">
      <img className="index__garland" src={art.garland} alt="" width={2000} height={636} />
      <header className="index__head">
        <p className="index__eyebrow">Wedding website · design exploration</p>
        <h1 className="index__names">
          {couple.first} &amp; {couple.second}
        </h1>
        <p className="index__date">{couple.date}</p>
      </header>

      {rounds.map(({ round, label }) => (
        <section key={round} className="index__round">
          <h2 className="index__eyebrow">{label}</h2>
          <ul className="index__versions">
            {versions
              .filter((version) => version.round === round)
              .map((version) => (
                <VersionCard key={version.id} version={version} />
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

export function NotFound() {
  usePageTitle("Page not found");

  return (
    <main className="index index--missing">
      <header className="index__head">
        <h1 className="index__names">Lost in the garden</h1>
        <p className="index__date">That page does not exist.</p>
        <p className="index__eyebrow">
          <Link to="/" className="index__back">
            Back to the versions
          </Link>
        </p>
      </header>
    </main>
  );
}
