import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { GardenArtwork, LineFlourish } from "../components/garden-art";
import { wedding } from "../content/wedding";

export const Route = createFileRoute("/style")({
  component: StyleBoard,
});

type FontDirection = "playful" | "romantic" | "personal";
type PaperTone = "ivory" | "blush";
type GardenDensity = "airy" | "lush";

const fontDirections = [
  {
    id: "playful",
    label: "Playful garden",
    script: "Borel",
    support: "Fraunces",
    note: "Rounded, warm, and a little unexpected.",
  },
  {
    id: "romantic",
    label: "Loose romantic",
    script: "La Belle Aurore",
    support: "Cormorant Garamond",
    note: "Lighter, more elegant, and closest to the sign reference.",
  },
  {
    id: "personal",
    label: "Personal note",
    script: "Beth Ellen",
    support: "Fraunces",
    note: "A stand-in for using Emma’s own digitized handwriting later.",
  },
] as const;

const palette = [
  { name: "Warm ivory", hex: "#FBF6EE" },
  { name: "Pale blush", hex: "#FBEDE8" },
  { name: "Coral", hex: "#F27B76" },
  { name: "Poppy", hex: "#EF5351" },
  { name: "Marigold", hex: "#F8B942" },
  { name: "Tangerine", hex: "#F58A2A" },
  { name: "Leaf", hex: "#6E982C" },
  { name: "Dark olive", hex: "#44472F" },
] as const;

function StyleBoard() {
  const [font, setFont] = useState<FontDirection>("playful");
  const [paper, setPaper] = useState<PaperTone>("ivory");
  const [density, setDensity] = useState<GardenDensity>("lush");

  return (
    <main className="style-board">
      <header className="style-board-header">
        <div>
          <p className="eyebrow">Emma & Eric · Design draft 01</p>
          <h1>
            Garden party,
            <br />
            drawn by hand.
          </h1>
          <p className="style-intro">
            A live style board for choosing typography, paper tone, and floral density before the
            rest of the site is built.
          </p>
        </div>
        <Link className="back-link" to="/">
          View homepage <span>→</span>
        </Link>
      </header>

      <section className="style-workbench" aria-label="Interactive design preview">
        <div className="style-controls">
          <fieldset>
            <legend>01 · Handwriting direction</legend>
            <div className="font-options">
              {fontDirections.map((option) => (
                <button
                  aria-pressed={font === option.id}
                  className="font-option"
                  data-font={option.id}
                  key={option.id}
                  onClick={() => setFont(option.id)}
                  type="button"
                >
                  <span className="font-option-sample">Emma & Eric</span>
                  <strong>{option.label}</strong>
                  <small>
                    {option.script} + {option.support}
                  </small>
                  <p>{option.note}</p>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="compact-controls">
            <fieldset>
              <legend>02 · Paper tone</legend>
              <div className="segmented-control">
                <button
                  aria-pressed={paper === "ivory"}
                  onClick={() => setPaper("ivory")}
                  type="button"
                >
                  Ivory
                </button>
                <button
                  aria-pressed={paper === "blush"}
                  onClick={() => setPaper("blush")}
                  type="button"
                >
                  Blush
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend>03 · Flowers</legend>
              <div className="segmented-control">
                <button
                  aria-pressed={density === "airy"}
                  onClick={() => setDensity("airy")}
                  type="button"
                >
                  Airy
                </button>
                <button
                  aria-pressed={density === "lush"}
                  onClick={() => setDensity("lush")}
                  type="button"
                >
                  Lush
                </button>
              </div>
            </fieldset>
          </div>
        </div>

        <div
          aria-live="polite"
          className="style-preview"
          data-density={density}
          data-font={font}
          data-paper={paper}
        >
          <p className="preview-kicker">Save the date</p>
          <h2>
            <span>{wedding.couple.first}</span>
            <span className="preview-ampersand">&</span>
            <span>{wedding.couple.second}</span>
          </h2>
          <LineFlourish className="preview-flourish" />
          <p className="preview-date">{wedding.date.compact}</p>
          <p className="preview-venue">
            {wedding.venue.name}
            <br />
            {wedding.venue.city}, {wedding.venue.region}
          </p>
          <GardenArtwork className="preview-garden" compact={density === "airy"} />
        </div>
      </section>

      <section className="palette-section">
        <div className="palette-heading">
          <p className="eyebrow">The palette</p>
          <h2>Warm flowers on paper.</h2>
          <p className="palette-description">
            Tulips inspired the color relationships, not the literal motif. The artwork can mix
            abstract garden forms that feel at home at Botanica.
          </p>
        </div>
        <div className="swatch-grid">
          {palette.map((color) => (
            <div className="swatch" key={color.hex}>
              <span style={{ backgroundColor: color.hex }} />
              <p>{color.name}</p>
              <small>{color.hex}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="direction-notes">
        <p className="eyebrow">Guardrails</p>
        <div>
          <p>Handwriting for names and expressive moments—not forms or long paragraphs.</p>
          <p>Original mixed botanicals—not a literal tulip theme and no borrowed Pinterest art.</p>
          <p>Ivory and blush paper tones—no blue background.</p>
          <p>Personal copy stays empty until Emma and Eric provide it.</p>
        </div>
      </section>
    </main>
  );
}
