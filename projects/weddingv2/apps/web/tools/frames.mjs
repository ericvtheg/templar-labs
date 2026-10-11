// Capture the v3 animations frame by frame, to review the choreography as stills.
// usage: node tools/frames.mjs [width] [height]
// Output: projects/weddingv2/scratch/shots/frames-*.png
/* oxlint-disable no-await-in-loop -- the frames are captured in order */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../scratch/shots");
const [width = "1366", height = "768"] = process.argv.slice(2);
const base = "http://127.0.0.1:5191";
const mobile = Number(width) < 860;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  hasTouch: mobile,
  isMobile: mobile,
});
page.on("pageerror", (error) => console.error("page error:", error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    console.error("console error:", message.text());
  }
});

async function burst(name, times) {
  const start = Date.now();
  for (const time of times) {
    const wait = time - (Date.now() - start);
    if (wait > 0) {
      await page.waitForTimeout(wait);
    }
    await page.screenshot({
      path: path.join(out, `frames-${name}-${String(time).padStart(4, "0")}.png`),
    });
  }
}

const tag = mobile ? "m-" : "";

await page.goto(`${base}/v3`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: ".switcher { display: none !important; }" });
await page.waitForTimeout(700);

await page.click(".v3-seal");
await burst(`${tag}open`, [120, 450, 800, 1150, 1500, 1900, 2400, 3200]);

const card = mobile ? '.v3-slide [data-card="schedule"]' : '[data-card="schedule"]';
await page.locator(card).scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.click(card);
await burst(`${tag}lift`, [60, 180, 320, 480, 900]);
console.log("url after open:", page.url());

await page.keyboard.press("Escape");
await burst(`${tag}down`, [80, 220, 400, 900]);
console.log("url after close:", page.url());
console.log(
  "focus after close:",
  await page.evaluate(() => document.activeElement?.getAttribute("data-card")),
);

await browser.close();
