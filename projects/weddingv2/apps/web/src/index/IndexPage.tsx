import "./index.css";

import { Link } from "react-router";
import { versions } from "../content/pages.ts";
import { couple } from "../content/site.ts";
import { art } from "../shared/art.ts";
import { usePageTitle } from "../shared/hooks.ts";

const stems = [art.stemCosmos, art.stemLily, art.stemSunflower] as const;

/** The root page: a chooser for the three design versions. */
export function IndexPage() {
  usePageTitle("Three directions");

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

      <ol className="index__versions">
        {versions.map((version, index) => (
          <li key={version.id}>
            <Link to={`/${version.id}`} className="index__card">
              <img className="index__stem" src={stems[index]} alt="" />
              <span className="index__number">{version.number}</span>
              <span className="index__name">{version.name}</span>
              <span className="index__blurb">{version.blurb}</span>
              <span className="index__open">
                Open <span aria-hidden="true">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
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
            Back to the three versions
          </Link>
        </p>
      </header>
    </main>
  );
}
