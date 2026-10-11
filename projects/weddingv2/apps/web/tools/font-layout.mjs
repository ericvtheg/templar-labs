/* oxlint-disable no-await-in-loop -- the batches run in order on one page */
// Identify a text font from where its words fall on a line.
//
// font-match.mjs compares letter shapes, which works for big type but not for
// small paragraphs. Word positions depend on every letter's width, so they are a
// sharper fingerprint for body text: the right font puts all the word edges
// within a pixel of Emma's, and other fonts drift by several.
//
// usage: node tools/font-layout.mjs <job> [--catalog "Serif"]     (jobs: body, script)
// The score is the root-mean-square miss of the word edges, in pixels. Lower is better.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

// Word boxes measured on the Canva screenshots: [left, right] of each word's ink, in pixels.
const jobs = {
  body: {
    families: [
      "Ovo",
      "Castoro",
      "Rufina",
      "STIX Two Text",
      "Libre Baskerville",
      "Lustria",
      "Gelasio",
      "Fenix",
    ],
    lines: [
      {
        text: "GETTING AROUND: Wichita is easiest to get around with a car. But, depending on where you stay,",
        words: [
          [164, 267],
          [275, 384],
          [394, 473],
          [481, 495],
          [504, 571],
          [579, 598],
          [607, 637],
          [645, 717],
          [725, 771],
          [779, 788],
          [797, 832],
          [843, 882],
          [892, 999],
          [1008, 1033],
          [1041, 1103],
          [1111, 1148],
          [1156, 1200],
        ],
      },
      {
        text: "Angeles. If you plan to use rideshare for the wedding, we recommend scheduling your ride ahead of",
        words: [
          [162, 248],
          [259, 275],
          [281, 317],
          [325, 368],
          [376, 395],
          [404, 437],
          [445, 540],
          [549, 577],
          [586, 617],
          [626, 718],
          [727, 755],
          [764, 886],
          [895, 1004],
          [1012, 1058],
          [1066, 1106],
          [1114, 1174],
          [1182, 1204],
        ],
      },
    ],
  },
  script: {
    families: ["Nothing You Could Do", "Reenie Beanie", "Zeyada", "Caveat", "La Belle Aurore"],
    lines: [
      {
        text: "Meet us in Kansas?",
        words: [
          [324, 519],
          [545, 609],
          [655, 709],
          [758, 1030],
        ],
      },
      {
        text: "Saturday, September 25",
        words: [
          [516, 645],
          [664, 802],
          [817, 849],
        ],
      },
    ],
  },
};

function catalog(categories) {
  let raw = readFileSync(path.resolve(here, "../../../scratch/gf-metadata.json"), "utf8");
  if (raw.startsWith(")]}")) {
    raw = raw.slice(raw.indexOf("\n") + 1);
  }
  return JSON.parse(raw)
    .familyMetadataList.filter(
      (family) =>
        categories.includes(family.category) &&
        family.subsets.includes("latin") &&
        "400" in family.fonts,
    )
    .filter(
      (family) => !family.isNoto || family.family === "Noto Serif" || family.family === "Noto Sans",
    )
    .map((family) => family.family);
}

/** Runs in the page. Scores each family by how far its word edges land from the reference. */
async function score({ families, lines }) {
  const added = await Promise.all(
    families.map(
      (family) =>
        new Promise((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@400&display=block`;
          link.addEventListener("load", () => resolve(link));
          link.addEventListener("error", () => resolve(link));
          document.head.append(link);
        }),
    ),
  );
  const context = document.createElement("canvas").getContext("2d");
  const results = [];

  for (const family of families) {
    const spec = `400 100px "${family}"`;
    try {
      await document.fonts.load(spec, lines.map((line) => line.text).join(""));
    } catch {
      continue;
    }
    if (!document.fonts.check(spec)) {
      continue;
    }
    context.font = spec;
    let squares = 0;
    let count = 0;
    const sizes = [];

    for (const line of lines) {
      // Ink edges of every word at 100px, from the advance of the text before it.
      const edges = [];
      let position = 0;
      const parts = line.text.split(" ");
      for (const [index, word] of parts.entries()) {
        const start = context.measureText(
          parts.slice(0, index).join(" ") + (index > 0 ? " " : ""),
        ).width;
        const metrics = context.measureText(word);
        edges.push(start - metrics.actualBoundingBoxLeft, start + metrics.actualBoundingBoxRight);
        position = start;
      }
      const target = line.words.flat();
      if (edges.length !== target.length || position === 0) {
        continue;
      }
      // Least-squares scale and shift from candidate edges to her edges.
      const n = edges.length;
      const meanX = edges.reduce((a, b) => a + b, 0) / n;
      const meanY = target.reduce((a, b) => a + b, 0) / n;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < n; i += 1) {
        sxx += (edges[i] - meanX) ** 2;
        sxy += (edges[i] - meanX) * (target[i] - meanY);
      }
      const scale = sxy / sxx;
      const shift = meanY - scale * meanX;
      for (let i = 0; i < n; i += 1) {
        squares += (scale * edges[i] + shift - target[i]) ** 2;
      }
      count += n;
      sizes.push(Math.round(scale * 1000) / 10);
    }
    if (count > 0) {
      results.push({
        font: family,
        missPx: Math.round(Math.sqrt(squares / count) * 100) / 100,
        sizePx: sizes.join(" / "),
      });
    }
  }
  for (const link of added) {
    link.remove();
  }
  return results;
}

const args = process.argv.slice(2);
const catalogAt = args.indexOf("--catalog");
const job = jobs[args[0]];
if (!job) {
  console.error('usage: node tools/font-layout.mjs <body|script> [--catalog "Serif"]');
  process.exit(1);
}
const families =
  catalogAt === -1
    ? job.families
    : catalog(args[catalogAt + 1].split(",").map((part) => part.trim()));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");
const all = [];
for (let start = 0; start < families.length; start += 150) {
  all.push(
    ...(await page.evaluate(score, {
      families: families.slice(start, start + 150),
      lines: job.lines,
    })),
  );
  if (families.length > 150) {
    process.stderr.write(`\r${Math.min(start + 150, families.length)} of ${families.length}`);
  }
}
await browser.close();

all.sort((a, b) => a.missPx - b.missPx);
console.log(`\n== ${args[0]}: ${all.length} of ${families.length} fonts measured ==`);
console.table(all.slice(0, 12));
