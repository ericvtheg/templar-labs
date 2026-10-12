/* oxlint-disable no-await-in-loop -- the pages are audited in order on one page */
/* oxlint-disable unicorn/consistent-function-scoping -- collect() runs in the browser, so its helpers must live inside it */
// Audit every page for text contrast and tap-target size. Start the dev server first.
// usage: node tools/audit.mjs
//
// Contrast follows WCAG AA: 4.5:1 below 24px, 3:1 from 24px. Display type of 40px
// and up is reported separately, because it keeps Emma's coral by design.
import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:5191";
const versions = ["v1", "v2", "v3", "v4", "v5", "v6", "v7"];
// v4 to v7 use Emma's coral for every word, as she designed it. Their contrast is
// counted and reported, but it is her decision, so it does not fail the audit.
const emmasPalette = (url) => ["/v4", "/v5", "/v6", "/v7"].some((prefix) => url.startsWith(prefix));
let emmasCoral = 0;
const slugs = ["", "schedule", "travel", "stay", "things-to-do", "faq"];
const urls = ["/", ...versions.flatMap((v) => slugs.map((s) => (s ? `/${v}/${s}` : `/${v}`)))];
const sizes = [
  { name: "laptop", width: 1366, height: 768, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

function collect() {
  const parse = (value) => {
    const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  };
  const luminance = ({ r, g, b }) => {
    const [x, y, z] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * x + 0.7152 * y + 0.0722 * z;
  };
  const background = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.a > 0.9) {
        return color;
      }
    }
    return { r: 246, g: 237, b: 230, a: 1 };
  };
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      box.width > 0 &&
      box.height > 0 &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0.05 &&
      !element.closest("[inert], [aria-hidden='true'], .sr-only, .switcher")
    );
  };

  const contrast = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    const element = walker.currentNode.parentElement;
    if (!text || !element || seen.has(element) || !visible(element)) {
      continue;
    }
    seen.add(element);
    const style = getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize);
    const fg = parse(style.color);
    const bg = background(element);
    const [light, dark] = [luminance(fg), luminance(bg)].toSorted((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const needed = size >= 24 ? 3 : 4.5;
    if (ratio < needed) {
      contrast.push({
        text: text.slice(0, 34),
        size: Math.round(size * 10) / 10,
        ratio: Math.round(ratio * 100) / 100,
        display: size >= 40,
      });
    }
  }

  const targets = [];
  for (const element of document.querySelectorAll("a, button")) {
    if (!visible(element)) {
      continue;
    }
    const box = element.getBoundingClientRect();
    const inline = getComputedStyle(element).display === "inline";
    if (!inline && (box.width < 44 || box.height < 44)) {
      targets.push({
        text: (element.textContent.trim() || element.getAttribute("aria-label") || "").slice(0, 30),
        w: Math.round(box.width),
        h: Math.round(box.height),
      });
    }
  }
  return { contrast, targets };
}

const browser = await chromium.launch();
let failures = 0;
const display = new Map();

for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.mobile,
    hasTouch: size.mobile,
  });
  await context.addInitScript(() =>
    window.sessionStorage.setItem("weddingv2:envelope-opened", "1"),
  );
  const page = await context.newPage();

  for (const url of urls) {
    await page.goto(base + url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    const { contrast, targets } = await page.evaluate(collect);

    for (const item of contrast) {
      if (emmasPalette(url)) {
        emmasCoral += 1;
      } else if (item.display) {
        display.set(`${item.ratio}`, (display.get(`${item.ratio}`) ?? 0) + 1);
      } else {
        failures += 1;
        console.log(
          `CONTRAST ${size.name} ${url}  "${item.text}"  ${item.size}px  ${item.ratio}:1`,
        );
      }
    }
    if (size.mobile) {
      for (const item of targets) {
        failures += 1;
        console.log(`TARGET   ${size.name} ${url}  "${item.text}"  ${item.w}x${item.h}`);
      }
    }
  }
  await context.close();
}

await browser.close();
console.log(`\n${failures} issue(s).`);
console.log(
  "Display type (40px and up) that keeps Emma's coral, by contrast ratio:",
  Object.fromEntries(display),
);
console.log(
  `Text in v4 to v7 that keeps Emma's coral below the contrast guideline: ${emmasCoral} pieces.`,
);
process.exitCode = failures > 0 ? 1 : 0;
