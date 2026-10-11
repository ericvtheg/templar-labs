// Screenshot every page at the review viewports. Start the dev server first.
// usage: node tools/shots.mjs [--only v1] [--page faq] [--size mobile] [--reduced] [--chrome] [--out dir]
// Output: projects/weddingv2/scratch/shots/<version>-<page>-<size>.png
/* oxlint-disable no-await-in-loop -- the shots run in order on one page */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const base = option("--base") ?? "http://127.0.0.1:5191";
const out = option("--out") ?? path.resolve(here, "../../../scratch/shots");
const only = option("--only");
const onlyPage = option("--page");
const onlySize = option("--size");
const reduced = args.includes("--reduced");
const keepChrome = args.includes("--chrome");
// --intro keeps the v3 envelope sealed, to shoot the first-visit state.
const intro = args.includes("--intro");

const sizes = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1366, height: 768 },
  mobile: { width: 390, height: 844 },
};
const versions = ["v1", "v2", "v3"];
const slugs = {
  home: "",
  schedule: "schedule",
  travel: "travel",
  stay: "stay",
  things: "things-to-do",
  faq: "faq",
};

const targets = [{ name: "index", url: "/" }];
for (const version of versions) {
  for (const [page, slug] of Object.entries(slugs)) {
    targets.push({ name: `${version}-${page}`, url: slug ? `/${version}/${slug}` : `/${version}` });
  }
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

for (const [sizeName, viewport] of Object.entries(sizes)) {
  if (onlySize && onlySize !== sizeName) {
    continue;
  }
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: sizeName === "mobile" ? 2 : 1,
    isMobile: sizeName === "mobile",
    hasTouch: sizeName === "mobile",
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  // The v3 envelope opens once per session. Skip it so the shots show the table.
  if (!intro) {
    await context.addInitScript(() =>
      window.sessionStorage.setItem("weddingv2:envelope-opened", "1"),
    );
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`  page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(`  console error: ${message.text()}`);
    }
  });

  for (const target of targets) {
    if (only && !target.name.startsWith(only)) {
      continue;
    }
    if (onlyPage && !target.name.endsWith(onlyPage)) {
      continue;
    }
    await page.goto(base + target.url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // The version switcher is reviewer chrome, so it stays out of the shots.
    if (!keepChrome) {
      await page.addStyleTag({ content: ".switcher { display: none !important; }" });
    }
    await page.waitForTimeout(reduced ? 300 : 1800);
    const suffix = `${reduced ? "-reduced" : ""}${intro ? "-intro" : ""}`;
    const file = path.join(out, `${target.name}-${sizeName}${suffix}.png`);
    await page.screenshot({ path: file, fullPage: sizeName === "mobile" });
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    const notes = [
      overflow.x > 0 ? `overflow-x ${overflow.x}px` : "",
      overflow.y > 0 ? `scrolls ${overflow.y}px` : "",
    ];
    console.log(`${target.name} ${sizeName} ${notes.filter(Boolean).join(", ")}`.trim());
  }
  await context.close();
}

await browser.close();
