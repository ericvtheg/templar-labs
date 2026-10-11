/* oxlint-disable no-await-in-loop -- pages are captured in order on one page */
// Photograph the v5 pages panel by panel, to hold next to Emma's Canva screenshots.
// v5 is used because it adds nothing to her homepage. Start the dev server first.
//
// usage: node tools/compare-canva.mjs
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
const pages = {
  home: ["/v5", "1.jpeg", [0, 1, 2, 3, 4]],
  travel: ["/v5/travel", "Travel.jpeg", [0, 1]],
  things: ["/v5/things-to-do", "things to do.jpeg", [0]],
  faq: ["/v5/faq", "FAQ.jpeg", [0]],
};

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
