// Generate an image via OpenRouter.
// usage: node tools/gen-image.mjs <model> <out.png> "<prompt>" [refImage...]
// Key: OPENROUTER_API_KEY env var, else ~/.pi/agent/auth.json (supports "!command" values).
// Prompts used for the shipped art are in tools/gen-sheets.mjs.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";

let key =
  // biome-ignore lint/style/noProcessEnv: a CLI reads its key from the environment
  process.env.OPENROUTER_API_KEY ??
  JSON.parse(readFileSync(`${os.homedir()}/.pi/agent/auth.json`, "utf8")).openrouter.key;
if (key.startsWith("!")) {
  key = execSync(key.slice(1), { encoding: "utf8" }).trim().split("\n")[0];
}
const [model, out, prompt, ...refs] = process.argv.slice(2);
const content = [{ type: "text", text: prompt }];
for (const r of refs) {
  const mime = r.endsWith(".png") ? "image/png" : "image/jpeg";
  content.push({
    type: "image_url",
    image_url: { url: `data:${mime};base64,${readFileSync(r).toString("base64")}` },
  });
}
// Optional: GEN_ASPECT (for example "16:9") and GEN_SIZE ("1K", "2K" or "4K").
// biome-ignore lint/style/noProcessEnv: a CLI reads its options from the environment
const { GEN_ASPECT: aspect_ratio, GEN_SIZE: image_size } = process.env;
const imageConfig =
  aspect_ratio || image_size ? { image_config: { aspect_ratio, image_size } } : {};
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    modalities: ["image", "text"],
    messages: [{ role: "user", content }],
    ...imageConfig,
  }),
});
const json = await res.json();
if (!res.ok) {
  console.error(JSON.stringify(json).slice(0, 800));
  process.exit(1);
}
const msg = json.choices?.[0]?.message;
const img = msg?.images?.[0]?.image_url?.url;
if (!img) {
  console.error("no image", JSON.stringify(json).slice(0, 800));
  process.exit(1);
}
writeFileSync(out, Buffer.from(img.split(",")[1], "base64"));
console.log("saved", out, "usage", JSON.stringify(json.usage ?? {}));
