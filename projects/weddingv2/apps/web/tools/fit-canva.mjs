/* oxlint-disable no-await-in-loop -- blocks are measured one at a time on one page */
// Fit the v4 text to Emma's Canva screenshots, and report how close it is.
//
// For every text block the tool measures where the ink falls in this app and
// where it falls on her screenshot, then corrects the block's position, size,
// line pitch and letter-spacing in src/v4/spec.json. It repeats until the two
// agree. Start the dev server first.
//
// usage: node tools/fit-canva.mjs [--round 3] [--rounds 5] [--check]
//        --round  which Canva export to fit: 2 (versions 4 and 5) or 3 (version 6). Default 3.
//        --rounds how many correction passes to run.
//        --check  only reports the remaining differences and changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const reference = path.resolve(here, "../../../reference");
const base = "http://127.0.0.1:5191";
const SCALE = 4;
const args = process.argv.slice(2);
const check = args.includes("--check");
const option = (name, fallback) =>
  args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback;
const rounds = check ? 1 : option("--rounds", 5);
const canvaRound = option("--round", 3);

// Where each block's ink is on Emma's screenshot: [left, top, right, bottom] in
// panel pixels, read off the 1x image. The tool re-measures inside this window at
// sub-pixel precision. `lines` is how many lines the block has. Display type also
// has `gaps`: the number of spaces between letters on its widest line.
const roundTwo = [
  {
    url: "/v5",
    panels: {
      home: { file: "1.jpeg", index: 0 },
      schedule: { file: "1.jpeg", index: 3 },
      welcome: { file: "1.jpeg", index: 4 },
    },
    blocks: {
      "home.names": { panel: "home", ink: [81, 97, 385, 340], lines: 3, gaps: 3 },
      "home.date": { panel: "home", ink: [79, 619, 598, 684], gaps: 17 },
      "sched.heading": { panel: "schedule", ink: [130, 84, 419, 124], gaps: 11 },
      "sched.name": { panel: "schedule", ink: [602, 237, 764, 272] },
      "sched.time": { panel: "schedule", ink: [562, 293, 803, 321] },
      "sched.note": { panel: "schedule", ink: [448, 347, 912, 375] },
      "sched.venue": { panel: "schedule", ink: [495, 451, 871, 484] },
      "sched.address": { panel: "schedule", ink: [479, 507, 886, 540] },
      "sched.parking": { panel: "schedule", ink: [440, 560, 926, 590] },
      "welcome.name": { panel: "welcome", ink: [590, 256, 775, 291] },
      "welcome.details": { panel: "welcome", ink: [375, 368, 992, 571], lines: 4 },
    },
  },
  {
    url: "/v5/travel",
    panels: { travel: { file: "Travel.jpeg", index: 0 }, stay: { file: "Travel.jpeg", index: 1 } },
    blocks: {
      "travel.heading": { panel: "travel", ink: [97, 52, 243, 93], gaps: 5 },
      "travel.p1": { panel: "travel", ink: [198, 149, 1168, 240], lines: 3 },
      "travel.p2": { panel: "travel", ink: [164, 281, 1201, 338], lines: 2 },
      "travel.p3": { panel: "travel", ink: [162, 379, 1205, 470], lines: 3 },
      "travel.p4": { panel: "travel", ink: [202, 512, 1164, 570], lines: 2 },
      "stay.intro": { panel: "stay", ink: [361, 123, 1004, 180], lines: 2 },
      "stay.h1.name": { panel: "stay", ink: [156, 240, 357, 266] },
      "stay.h1.address": { panel: "stay", ink: [127, 289, 387, 311] },
      "stay.h1.notes": { panel: "stay", ink: [83, 356, 426, 409], lines: 2 },
      "stay.h2.name": { panel: "stay", ink: [533, 241, 831, 323], lines: 2 },
      "stay.h2.address": { panel: "stay", ink: [540, 339, 826, 362] },
      "stay.h2.notes": { panel: "stay", ink: [521, 408, 845, 489], lines: 3 },
      "stay.h3.name": { panel: "stay", ink: [1000, 241, 1201, 266] },
      "stay.h3.address": { panel: "stay", ink: [947, 290, 1254, 314] },
      "stay.h3.notes": { panel: "stay", ink: [939, 357, 1262, 410], lines: 2 },
    },
  },
  {
    url: "/v5/things-to-do",
    panels: { things: { file: "things to do.jpeg", index: 0 } },
    blocks: {
      "things.heading": { panel: "things", ink: [77, 64, 326, 105], gaps: 11 },
      "things.i1.title": { panel: "things", ink: [685, 56, 902, 78] },
      "things.i1.text": { panel: "things", ink: [684, 96, 1137, 152], lines: 3 },
      "things.i2.title": { panel: "things", ink: [685, 218, 972, 236] },
      "things.i2.text": { panel: "things", ink: [684, 259, 1211, 297], lines: 2 },
      "things.i3.title": { panel: "things", ink: [685, 360, 883, 382] },
      // Emma's line has a stray word ("find grab a coffee") that the site drops, so it is
      // shorter than hers. Only its position is fitted. Its size follows the other items.
      "things.i3.text": { panel: "things", ink: [684, 400, 1189, 416], positionOnly: true },
      "things.i4.title": { panel: "things", ink: [684, 493, 794, 511] },
      "things.i4.text": { panel: "things", ink: [685, 533, 1155, 549] },
      "things.food": { panel: "things", ink: [675, 633, 1208, 717], lines: 3 },
    },
  },
  {
    url: "/v5/faq",
    panels: { faq: { file: "FAQ.jpeg", index: 0 } },
    blocks: { "faq.heading": { panel: "faq", ink: [78, 88, 425, 201], lines: 2, gaps: 15 } },
  },
];

const startingWith = (blocks, prefix) =>
  Object.fromEntries(Object.entries(blocks).filter(([id]) => id.startsWith(prefix)));

// Round three. The hotels and the things to do did not move, so their windows are reused.
const roundThree = [
  {
    url: "/v6",
    panels: {
      home: { file: "round-3/home.png", index: 0 },
      schedule: { file: "round-3/home.png", index: 2 },
      wedding: { file: "round-3/home.png", index: 3 },
    },
    blocks: {
      "home.names": { panel: "home", ink: [78, 95, 313, 361], lines: 3, gaps: 3 },
      "home.date": { panel: "home", ink: [79, 619, 598, 684], gaps: 17 },
      "sched.heading": { panel: "schedule", ink: [130, 84, 419, 124], gaps: 11 },
      "welcome.name": { panel: "schedule", ink: [591, 256, 775, 291] },
      "welcome.details": { panel: "schedule", ink: [367, 367, 999, 571], lines: 4 },
      "sched.name": { panel: "wedding", ink: [602, 237, 764, 272] },
      "sched.time": { panel: "wedding", ink: [562, 293, 803, 321] },
      "sched.note": { panel: "wedding", ink: [448, 347, 912, 375] },
      "sched.venue": { panel: "wedding", ink: [495, 451, 871, 484] },
      "sched.address": { panel: "wedding", ink: [479, 507, 886, 540] },
      "sched.parking": { panel: "wedding", ink: [440, 561, 927, 590] },
    },
  },
  {
    url: "/v6/travel",
    panels: {
      stay: { file: "round-3/travel.png", index: 0 },
      travel: { file: "round-3/travel.png", index: 1 },
    },
    blocks: {
      "travel.heading": { panel: "stay", ink: [97, 53, 243, 93], gaps: 5 },
      ...startingWith(roundTwo[1].blocks, "stay."),
      "flight.label": { panel: "travel", ink: [310, 248, 382, 270] },
      "flight.p1": { panel: "travel", ink: [166, 287, 527, 353], lines: 2 },
      "flight.p2": { panel: "travel", ink: [130, 404, 563, 548], lines: 4 },
      "around.label": { panel: "travel", ink: [897, 190, 1059, 210] },
      "around.p1": { panel: "travel", ink: [722, 226, 1234, 317], lines: 3 },
      "around.p2": { panel: "travel", ink: [753, 368, 1204, 534], lines: 5 },
      "around.p3": { panel: "travel", ink: [740, 580, 1217, 641], lines: 2 },
    },
  },
  {
    url: "/v6/things-to-do",
    panels: { things: { file: "round-3/things.png", index: 0 } },
    blocks: {
      ...roundTwo[2].blocks,
      // Round four changed two words here ("Our" to "Emma's"), so the lines are no
      // longer the width of the round-three export. Only the position is checked.
      "things.i1.text": { ...roundTwo[2].blocks["things.i1.text"], positionOnly: true },
    },
  },
  {
    url: "/v6/faq",
    panels: { faq: { file: "round-3/faq.png", index: 0 } },
    blocks: roundTwo[3].blocks,
  },
];

const jobs = {
  2: { spec: "../src/v4/spec.json", pages: roundTwo },
  3: { spec: "../src/v6/spec.json", pages: roundThree },
};
if (!jobs[canvaRound]) {
  console.error("--round must be 2 or 3");
  process.exit(1);
}
const specPath = path.resolve(here, jobs[canvaRound].spec);
const pages = jobs[canvaRound].pages;

/** Runs in the helper page: the ink box of an image, in image pixels. */
async function inkBox({ url, crop, scale }) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.addEventListener("load", resolve);
    image.addEventListener("error", reject);
    image.src = url;
  });
  const region = crop ?? { x: 0, y: 0, w: image.width, h: image.height };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(region.w * scale);
  canvas.height = Math.round(region.h * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    region.x,
    region.y,
    region.w,
    region.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let x0 = canvas.width;
  let y0 = canvas.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      // Ink is anything about a third of the way from the cream paper to the coral.
      if (246 - data[i] + (237 - data[i + 1]) + (230 - data[i + 2]) > 90) {
        if (x < x0) {
          x0 = x;
        }
        if (x > x1) {
          x1 = x;
        }
        if (y < y0) {
          y0 = y;
        }
        if (y > y1) {
          y1 = y;
        }
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

const round2 = (value) => Math.round(value * 100) / 100;
const browser = await chromium.launch();
const helper = await (await browser.newContext()).newPage();
await helper.goto("about:blank");
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  deviceScaleFactor: SCALE,
});
await context.addInitScript(() => window.sessionStorage.setItem("weddingv2:envelope-opened", "1"));
const page = await context.newPage();
const dataUrl = (file) => {
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(path.join(reference, file)).toString("base64")}`;
};

/** Emma's ink box for a block, measured at sub-pixel precision inside its 1x window. */
async function targetBox(panel, ink) {
  const margin = 3;
  const crop = {
    x: ink[0] - margin,
    y: panel.index * 768 + ink[1] - margin,
    w: ink[2] - ink[0] + margin * 2,
    h: ink[3] - ink[1] + margin * 2,
  };
  const box = await helper.evaluate(inkBox, { url: dataUrl(panel.file), crop, scale: SCALE });
  return [
    crop.x + box[0] / SCALE,
    crop.y - panel.index * 768 + box[1] / SCALE,
    crop.x + box[2] / SCALE,
    crop.y - panel.index * 768 + box[3] / SCALE,
  ];
}

let worst = 0;
for (let round = 1; round <= rounds; round += 1) {
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const report = [];
  worst = 0;

  for (const job of pages) {
    await page.goto(base + job.url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: ".switcher { display: none !important; }" });
    await page.waitForTimeout(400);

    for (const [id, block] of Object.entries(job.blocks)) {
      const panel = job.panels[block.panel];
      const target = await targetBox(panel, block.ink);

      // Show only this block, then photograph the part of its panel around it.
      const panelTop = await page.evaluate(
        ({ blockId, panelId }) => {
          const panelElement = document.querySelector(`[data-panel="${panelId}"]`);
          for (const element of panelElement.querySelectorAll(
            "[data-block], img, hr, figure, .v4-book, .v4-faq, .v4-photo",
          )) {
            element.style.visibility = element.dataset.block === blockId ? "visible" : "hidden";
          }
          return panelElement.getBoundingClientRect().top + window.scrollY;
        },
        { blockId: id, panelId: block.panel },
      );
      const pad = 70;
      const clip = {
        x: Math.max(0, block.ink[0] - pad),
        y: panelTop + Math.max(0, block.ink[1] - pad),
        width: Math.min(1366, block.ink[2] + pad) - Math.max(0, block.ink[0] - pad),
        height: Math.min(768, block.ink[3] + pad) - Math.max(0, block.ink[1] - pad),
      };
      const shot = await page.screenshot({ clip, fullPage: true });
      const box = await helper.evaluate(inkBox, {
        url: `data:image/png;base64,${shot.toString("base64")}`,
        crop: null,
        scale: 1,
      });
      if (!box) {
        report.push({ block: id, note: "no ink found" });
        continue;
      }
      const actual = [
        clip.x + box[0] / SCALE,
        clip.y - panelTop + box[1] / SCALE,
        clip.x + box[2] / SCALE,
        clip.y - panelTop + box[3] / SCALE,
      ];

      const entry = spec[id];
      const lines = block.lines ?? 1;
      const centered = entry.w !== undefined && !id.startsWith("things.");
      const width = { target: target[2] - target[0], actual: actual[2] - actual[0] };
      const height = { target: target[3] - target[1], actual: actual[3] - actual[1] };
      const off = {
        left: round2(actual[0] - target[0]),
        top: round2(actual[1] - target[1]),
        width: round2(width.actual - width.target),
        height: round2(height.actual - height.target),
      };
      report.push({ block: id, ...off, size: entry.size, pitch: entry.pitch, ls: entry.ls ?? "" });
      worst = Math.max(
        worst,
        Math.abs(off.left),
        Math.abs(off.top),
        Math.abs(off.width),
        Math.abs(off.height),
      );

      if (check) {
        continue;
      }
      if (block.positionOnly) {
        entry.x = round2(entry.x + target[0] - actual[0]);
        entry.y = round2(entry.y + target[1] - actual[1]);
        continue;
      }
      if (entry.ls !== undefined) {
        // Display type: size from the height of one line, letter-spacing from the width.
        const gaps = (lines - 1) * entry.pitch;
        const scale = (height.target - gaps) / (height.actual - gaps);
        const size = entry.size * scale;
        // Letter-spacing widens the line by one step per gap between letters.
        entry.ls =
          Math.round(
            (entry.ls + (width.target - width.actual * scale) / (block.gaps * size)) * 10000,
          ) / 10000;
        entry.size = round2(size);
      } else {
        // Text type: size from the width. The line pitch is not fitted. It is set in
        // spec.json from the distance between Emma's line tops, which is the same for
        // every block of a style, whereas a block's total height depends on which
        // letters happen to sit on its first and last lines.
        entry.size = round2(entry.size * (width.target / width.actual));
      }
      if (centered) {
        entry.x = round2(entry.x + (target[0] + target[2]) / 2 - (actual[0] + actual[2]) / 2);
      } else {
        entry.x = round2(entry.x + target[0] - actual[0]);
      }
      entry.y = round2(entry.y + target[1] - actual[1]);
    }
  }

  console.log(`\nround ${round}: largest difference ${round2(worst)} px`);
  if (round === rounds) {
    console.table(report);
  }
  if (!check) {
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  }
}

await browser.close();
if (check && worst > 1.5) {
  process.exitCode = 1;
}
