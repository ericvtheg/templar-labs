// Print bounding boxes and computed styles for a selector. Debugging aid for layout work.
// usage: node tools/probe.mjs <path> <selector> [width] [height] [cssProp,cssProp]
import { chromium } from "@playwright/test";

const [url = "/", selector = "body", width = "390", height = "844", props = ""] =
  process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
page.on("pageerror", (error) => console.error("page error:", error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    console.error("console error:", message.text());
  }
});
await page.addInitScript(() => window.sessionStorage.setItem("weddingv2:envelope-opened", "1"));
await page.goto(`http://127.0.0.1:5191${url}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const rows = await page.evaluate(
  ({ query, names }) =>
    Array.from(document.querySelectorAll(query)).map((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const row = {
        el: `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 60),
        x: Math.round(box.x),
        y: Math.round(box.y + window.scrollY),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
      for (const name of names) {
        row[name] = style.getPropertyValue(name);
      }
      return row;
    }),
  { query: selector, names: props.split(",").filter(Boolean) },
);
console.table(rows);
await browser.close();
