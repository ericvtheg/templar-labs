/* oxlint-disable no-await-in-loop -- the jobs run in order on one page */
// Identify the fonts in Emma's Canva design by overlaying candidates on her lettering.
// usage: node tools/font-match.mjs [job...] [--catalog "Sans Serif,Display"]
//        jobs: names, heading, date, script, body, serif
// Scores are intersection over union of the ink. 1 is a perfect overlap.
// --catalog swaps the short candidate list for every Google Fonts family in those
// categories. It needs scratch/gf-metadata.json (https://fonts.google.com/metadata/fonts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const reference = path.resolve(here, "../../../reference");
const image = (file) => {
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(path.join(reference, file)).toString("base64")}`;
};

const weights = (family, list) => list.map((weight) => ({ family, weight }));

const sans = [
  ...[
    "Montserrat",
    "Raleway",
    "Poppins",
    "DM Sans",
    "Jost",
    "Outfit",
    "Sora",
    "Lexend",
    "Epilogue",
  ].flatMap((f) => weights(f, [300, 400, 500])),
  ...[
    "Josefin Sans",
    "Red Hat Display",
    "Hanken Grotesk",
    "Albert Sans",
    "Figtree",
    "Urbanist",
    "Manrope",
  ].flatMap((f) => weights(f, [300, 400])),
  ...[
    "Plus Jakarta Sans",
    "Be Vietnam Pro",
    "Inter",
    "Work Sans",
    "Public Sans",
    "Mulish",
    "Nunito Sans",
  ].flatMap((f) => weights(f, [300, 400])),
  ...[
    "Lato",
    "Open Sans",
    "Karla",
    "Rubik",
    "Barlow",
    "Heebo",
    "Roboto",
    "Kumbh Sans",
    "League Spartan",
  ].flatMap((f) => weights(f, [300, 400])),
  ...[
    "Archivo",
    "Space Grotesk",
    "Instrument Sans",
    "Onest",
    "Geologica",
    "Schibsted Grotesk",
    "Kanit",
    "Prompt",
  ].flatMap((f) => weights(f, [300, 400])),
  ...[
    "Encode Sans",
    "Encode Sans Semi Expanded",
    "Encode Sans Expanded",
    "Unbounded",
    "Readex Pro",
  ].flatMap((f) => weights(f, [300, 400])),
  ...[
    "Mona Sans",
    "Hubot Sans",
    "Geist",
    "Afacad",
    "Commissioner",
    "Overpass",
    "Catamaran",
    "Maven Pro",
  ].flatMap((f) => weights(f, [300, 400])),
  ...[
    "Tenor Sans",
    "Julius Sans One",
    "Syncopate",
    "Questrial",
    "Didact Gothic",
    "Belleza",
    "Antic",
    "Alata",
    "Federo",
    "Gruppo",
    "Poiret One",
    "Michroma",
    "Syne",
    "Arimo",
    "Varela",
    "Quattrocento Sans",
    "Cabin",
    "Oxygen",
    "Marcellus",
    "Marcellus SC",
    "Forum",
    "Spinnaker",
    "Gothic A1",
    "Familjen Grotesk",
    "Host Grotesk",
    "Funnel Display",
    "Wix Madefor Display",
    "Golos Text",
    "Bricolage Grotesque",
    "Parkinsans",
    "Gantari",
    "Anek Latin",
    "Sarabun",
    "Krub",
    "Niramit",
    "Livvic",
    "Tajawal",
    "Almarai",
    "Hind",
    "Assistant",
    "Source Sans 3",
    "IBM Plex Sans",
    "Noto Sans",
    "PT Sans",
    "Ubuntu",
    "Titillium Web",
    "Exo 2",
    "Signika",
    "Nunito",
    "Cairo",
    "Mukta",
  ].flatMap((f) => weights(f, [400])),
];

const serif = [
  "Instrument Serif",
  "Playfair Display",
  "Cormorant Garamond",
  "Newsreader",
  "Libre Caslon Condensed",
  "Gloock",
  "Bodoni Moda",
  "Fraunces",
  "DM Serif Display",
  "Abril Fatface",
  "Antic Didone",
  "Old Standard TT",
  "Prata",
  "Gilda Display",
  "Cormorant",
  "EB Garamond",
  "Libre Baskerville",
  "Lora",
  "Crimson Text",
  "Young Serif",
  "Roboto Serif",
  "Noto Serif Display",
  "Bellefair",
  "Sorts Mill Goudy",
  "Rozha One",
].flatMap((f) => weights(f, [400]));

const script = [
  "Nothing You Could Do",
  "Reenie Beanie",
  "Covered By Your Grace",
  "Waiting for the Sunrise",
  "Caveat",
  "Sue Ellen Francisco",
  "Just Me Again Down Here",
  "Zeyada",
  "Kristi",
  "Shadows Into Light Two",
  "Shadows Into Light",
  "Over the Rainbow",
  "Give You Glory",
  "Loved by the King",
  "Homemade Apple",
  "La Belle Aurore",
  "Rock Salt",
  "Beth Ellen",
  "Nanum Pen Script",
  "Indie Flower",
  "Gloria Hallelujah",
  "Dawning of a New Day",
  "Cedarville Cursive",
  "Mrs Saint Delafield",
  "Mr Dafoe",
  "Sacramento",
].flatMap((f) => weights(f, [400]));

const body = [
  "Lustria",
  "Alike",
  "Gelasio",
  "Rosarivo",
  "Martel",
  "Domine",
  "Lora",
  "Brygada 1918",
  "Junicode",
  "Gupter",
  "Trirong",
  "Cormorant",
  "Libre Baskerville",
  "Crimson Text",
  "EB Garamond",
  "Sorts Mill Goudy",
  "Cardo",
  "Neuton",
  "Vollkorn",
  "Spectral",
  "Source Serif 4",
  "PT Serif",
  "Merriweather",
  "Noto Serif",
  "Radley",
  "Ovo",
  "Fanwood Text",
  "Linden Hill",
  "IM Fell English",
  "Goudy Bookletter 1911",
  "Average",
  "Quattrocento",
  "Arapey",
  "Buenard",
  "Esteban",
].flatMap((f) => weights(f, [400]));

const jobs = {
  names: {
    fonts: sans,
    images: { home: "1.jpeg" },
    lines: [
      { name: "EMMA", text: "EMMA", image: "home", crop: { x: 66, y: 84, w: 340, h: 88 } },
      {
        name: "amp",
        text: "&",
        image: "home",
        crop: { x: 66, y: 176, w: 100, h: 88 },
        fitSpacing: false,
      },
      { name: "ERIC", text: "ERIC", image: "home", crop: { x: 66, y: 266, w: 270, h: 88 } },
    ],
  },
  // Round 3: Emma set the names in a serif.
  names3: {
    fonts: serif,
    images: { home: "round-3/home.png" },
    lines: [
      { name: "EMMA", text: "EMMA", image: "home", crop: { x: 66, y: 84, w: 260, h: 90 } },
      {
        name: "amp",
        text: "&",
        image: "home",
        crop: { x: 66, y: 182, w: 80, h: 90 },
        fitSpacing: false,
      },
      { name: "ERIC", text: "ERIC", image: "home", crop: { x: 66, y: 281, w: 204, h: 90 } },
    ],
  },
  // Round 3: the Flight and Getting around text.
  travel3: {
    fonts: serif,
    images: { travel: "round-3/travel.png" },
    lines: [
      {
        name: "line",
        text: "Downtown Wichita. There are no direct flights",
        image: "travel",
        crop: { x: 120, y: 768 + 436, w: 452, h: 40 },
      },
    ],
  },
  date: {
    fonts: serif,
    images: { home: "1.jpeg" },
    lines: [
      {
        name: "date",
        text: "SEPTEMBER 25, 2027",
        image: "home",
        crop: { x: 66, y: 606, w: 560, h: 84 },
      },
    ],
  },
  heading: {
    fonts: serif,
    images: { things: "things to do.jpeg" },
    lines: [
      {
        name: "heading",
        text: "THINGS TO DO",
        image: "things",
        crop: { x: 66, y: 50, w: 280, h: 70 },
      },
    ],
  },
  serif: {
    fonts: serif,
    images: { faq: "FAQ.jpeg" },
    lines: [
      {
        name: "question",
        text: "Is the wedding indoor or outdoors?",
        image: "faq",
        crop: { x: 676, y: 76, w: 290, h: 34 },
      },
    ],
  },
  // Thin strokes on a long line drift apart even in the right font, so these jobs
  // compare single words.
  script: {
    fonts: script,
    // Handwriting is thin and never lands exactly, so near misses count.
    tolerance: 6,
    images: { home: "1.jpeg" },
    lines: [
      { name: "Kansas", text: "Kansas?", image: "home", crop: { x: 748, y: 1092, w: 292, h: 104 } },
      { name: "Meet", text: "Meet", image: "home", crop: { x: 314, y: 1096, w: 215, h: 98 } },
    ],
  },
  body: {
    fonts: body,
    images: { travel: "Travel.jpeg" },
    lines: [
      {
        name: "Eisenhower",
        text: "Eisenhower",
        image: "travel",
        crop: { x: 686, y: 142, w: 129, h: 34 },
      },
      { name: "Wichita", text: "Wichita", image: "travel", crop: { x: 482, y: 142, w: 89, h: 34 } },
      {
        name: "National",
        text: "National",
        image: "travel",
        crop: { x: 814, y: 142, w: 96, h: 34 },
      },
    ],
  },
  word: {
    fonts: serif,
    images: { home: "1.jpeg" },
    lines: [
      {
        name: "wedding",
        text: "The Wedding",
        image: "home",
        crop: { x: 594, y: 2532, w: 178, h: 52 },
      },
    ],
  },
};

/** Every Google Fonts family in the given categories, at light, regular and medium. */
function catalog(wantedCategories) {
  let raw = readFileSync(path.resolve(here, "../../../scratch/gf-metadata.json"), "utf8");
  if (raw.startsWith(")]}")) {
    raw = raw.slice(raw.indexOf("\n") + 1);
  }
  const basicNoto = ["Noto Sans", "Noto Serif", "Noto Sans Display", "Noto Serif Display"];
  const fonts = [];
  for (const family of JSON.parse(raw).familyMetadataList) {
    if (!wantedCategories.includes(family.category) || !family.subsets.includes("latin")) {
      continue;
    }
    // Noto families for other scripts carry the same basic Latin as Noto Sans.
    if (family.isNoto && !basicNoto.includes(family.family)) {
      continue;
    }
    for (const weight of [300, 400, 500]) {
      if (String(weight) in family.fonts) {
        fonts.push({ family: family.family, weight });
      }
    }
  }
  return fonts;
}

/** Runs in the page: adds the stylesheets, scores the fonts, then removes the stylesheets. */
async function loadAndScore(payload) {
  const added = await Promise.all(
    payload.links.map(
      (href) =>
        new Promise((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.addEventListener("load", () => resolve(link));
          link.addEventListener("error", () => resolve(link));
          document.head.append(link);
        }),
    ),
  );
  const scored = await window.run(payload.job);
  for (const link of added) {
    link.remove();
  }
  return scored;
}

const args = process.argv.slice(2);
const catalogAt = args.indexOf("--catalog");
const categories =
  catalogAt === -1 ? null : args[catalogAt + 1].split(",").map((part) => part.trim());
const wanted = args.filter((arg, index) => !arg.startsWith("--") && index !== catalogAt + 1);
const names = wanted.length > 0 ? wanted : Object.keys(jobs);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(here, "font-match.html")).href);

for (const name of names) {
  const job = jobs[name];
  if (!job) {
    console.error(`unknown job: ${name}`);
    continue;
  }
  const fonts = categories ? catalog(categories) : job.fonts;
  const images = Object.fromEntries(
    Object.entries(job.images).map(([key, file]) => [key, image(file)]),
  );
  const all = [];
  const errors = new Set();

  // Fonts are loaded and scored in batches, so the page never holds the whole catalog.
  for (let start = 0; start < fonts.length; start += 120) {
    const batch = fonts.slice(start, start + 120);
    const links = batch.map(
      (font) =>
        `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(" ", "+")}:wght@${font.weight}&display=block`,
    );
    const outcome = await page.evaluate(loadAndScore, {
      links,
      job: { ...job, fonts: batch, images },
    });
    all.push(...outcome.results);
    for (const error of outcome.errors) {
      errors.add(error);
    }
    if (fonts.length > 200) {
      process.stderr.write(`\r${name}: ${Math.min(start + 120, fonts.length)} of ${fonts.length}`);
    }
  }

  all.sort((a, b) => b.score - a.score);
  if (errors.size > 0) {
    console.error("\nerrors:", [...errors]);
  }
  console.log(`\n== ${name}: ${all.length} of ${fonts.length} candidates scored ==`);
  // Some families share one Latin design and tie exactly. Show each score once.
  const distinct = all.filter((row, index) => index === 0 || row.score !== all[index - 1].score);
  console.table(distinct.slice(0, 14));
  for (const family of ["Nothing You Could Do", "Lustria", "Instrument Serif", "Fahkwang"]) {
    const rank = all.findIndex((row) => row.font.startsWith(family));
    if (rank > 13) {
      console.log(`${family}: rank ${rank + 1}, score ${all[rank].score}`);
    }
  }
}

await browser.close();
