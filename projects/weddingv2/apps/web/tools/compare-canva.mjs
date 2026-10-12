/* oxlint-disable no-await-in-loop -- pages are captured in order on one page */
// Photograph the exact versions panel by panel, to hold next to Emma's Canva screenshots.
// Start the dev server first, or run this through tools/with-server.mjs.
//
// usage: node tools/compare-canva.mjs [--round 3]     (2 = version 5, 3 = version 6)
// Output: scratch/shots/canva-<page>-<n>.png, one 1366 x 768 image per panel,
// plus scratch/shots/canva-ref-<page>-<n>.png cut from her screenshot.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../scratch/shots");
const reference = path.resolve(here, "../../../reference");
const base = "http://127.0.0.1:5191";

// page -> [url, Emma's screenshot, which of her panels each of our panels matches]
const rounds = {
  // Round two is version 5, which adds nothing to her homepage.
  2: {
    home: ["/v5", "1.jpeg", [0, 1, 2, 3, 4]],
    travel: ["/v5/travel", "Travel.jpeg", [0, 1]],
    things: ["/v5/things-to-do", "things to do.jpeg", [0]],
    faq: ["/v5/faq", "FAQ.jpeg", [0]],
  },
  // Round three is version 6.
  3: {
    home: ["/v6", "round-3/home.png", [0, 1, 2, 3]],
    travel: ["/v6/travel", "round-3/travel.png", [0, 1]],
    things: ["/v6/things-to-do", "round-3/things.png", [0]],
    faq: ["/v6/faq", "round-3/faq.png", [0]],
  },
};
const roundArg = process.argv.indexOf("--round");
const pages = rounds[roundArg === -1 ? 3 : Number(process.argv[roundArg + 1])];
if (!pages) {
  console.error("--round must be 2 or 3");
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

for (const [name, [url, file, panels]] of Object.entries(pages)) {
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: ".switcher { display: none !important; }" });
  await page.waitForTimeout(500);
  const tops = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-panel]")).map(
      (panel) => panel.getBoundingClientRect().top + window.scrollY,
    ),
  );
  for (const [index, panelIndex] of panels.entries()) {
    const mine = path.join(out, `canva-${name}-${index + 1}.png`);
    await page.screenshot({
      path: mine,
      fullPage: true,
      clip: { x: 0, y: tops[index], width: 1366, height: 768 },
    });
    execFileSync("magick", [
      path.join(reference, file),
      "-crop",
      `1366x768+0+${panelIndex * 768}`,
      "+repage",
      path.join(out, `canva-ref-${name}-${index + 1}.png`),
    ]);
  }
  console.log(name, panels.length, "panel(s)");
}
await browser.close();
