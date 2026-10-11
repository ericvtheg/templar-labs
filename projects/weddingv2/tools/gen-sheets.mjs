// Generate the extra illustration sheets in Emma's style. Each run costs about $0.14 per sheet.
// usage: node tools/gen-sheets.mjs [name...]   (no names = every sheet)
// Output: scratch/generated/sheet-<name>.png. Slice with tools/slice-sheets.py.
import { execFile, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const model = "google/gemini-3-pro-image";
const refs = ["scratch/generated/ref-home.jpg", "scratch/generated/ref-faq.jpg"];

const style =
  "Hand-drawn illustration in the exact style of the two reference images: loose, sparse, scribbly " +
  "colored-pencil and thin marker strokes, mostly outlines with only a little scribbled fill, lots of " +
  "negative space, unfinished wobbly edges, naive and charming, like a quick sketch by the same artist. " +
  "Limited palette only: coral red-orange (#EE6A4F), soft pink (#E8B4AC), lime green (#9DBF3E), mustard " +
  "ochre (#D9B36A). Perfectly flat plain cream background (#F6EDE6), no paper texture, no shadows, no " +
  "gradients, no border, no grid lines, no text, no lettering, no numbers.";

const grid =
  "Draw six separate small spot illustrations arranged in a tidy grid of 3 columns and 2 rows. Each one " +
  "is centered in its own cell with generous empty cream space around it. None touch or overlap, and all " +
  "have a similar visual size. Reading left to right, top row then bottom row: ";

const sheets = {
  stems: {
    aspect: "16:9",
    prompt:
      "Draw six separate single flower stems standing upright side by side in one row, evenly spaced with " +
      "clear empty cream space between them, none touching or overlapping, each fully inside the frame with " +
      "margin: (1) a coral cosmos daisy with an ochre center on a thin lime stem with a few feathery leaves, " +
      "(2) a stem with three small ochre tulip-like buds, (3) a lime green leafy sprig with small oval " +
      "leaves, (4) a soft pink outlined lily with an ochre star center, (5) a coral scribble-spiral rose " +
      "with two lime leaves, (6) a Kansas sunflower with ochre petals and a coral center.",
  },
  travel: {
    aspect: "3:2",
    prompt:
      grid +
      "(1) two champagne coupe glasses clinking with a few bubbles, (2) a small airplane flying with a " +
      "dashed looping trail behind it, (3) an old-fashioned hotel room key with a tassel, (4) a vintage " +
      "suitcase with a flower tucked under its strap, (5) a small vintage car seen from the side, (6) a " +
      "round hotel reception desk bell.",
  },
  wichita: {
    aspect: "3:2",
    prompt:
      grid +
      "(1) a stack of three books with a coffee cup on top, (2) a vintage dress on a clothes hanger, (3) a " +
      "cowboy boot with a flower stem tucked in it, (4) a deer standing in tall grass, (5) a dinner plate " +
      "with a fork and a knife beside it, (6) a cocktail glass with a citrus twist.",
  },
  wedding: {
    aspect: "3:2",
    prompt:
      grid +
      "(1) a garden wedding arch covered in flowers and leaves, (2) a folding garden chair with a small " +
      "bouquet tied to its back, (3) a crescent moon with a few small stars, (4) a sun peeking from behind " +
      "a small cloud, (5) a wrapped gift box with a ribbon bow, (6) a bow tie.",
  },
  garland: {
    aspect: "21:9",
    prompt:
      "Draw one long horizontal garland of wildflowers, leaves and grasses, like a loose swag stretching " +
      "across the full width of the image and gently dipping in the middle. Cosmos, small roses, lilies, " +
      "ochre buds and lime leaves, airy and sparse with gaps between the stems. Keep the top third and the " +
      "bottom third of the image empty cream.",
  },
  meadow: {
    aspect: "21:9",
    prompt:
      "Draw one single row of tall wildflowers and grasses standing upright side by side, like a garden " +
      "border seen from the side, stretching across the full width of the image. Every stem starts at the " +
      "very bottom edge of the image and runs off it. Heights vary between one third and three quarters of " +
      "the image height. Airy and sparse with clear gaps between the stems: cosmos, lilies, small scribble " +
      "roses, ochre buds, sunflowers, lime leaves and grasses. Draw each flower only once, with one flower " +
      "head per stem. The area above the flowers is empty flat cream.",
  },
};

// biome-ignore lint/style/noProcessEnv: a CLI reads its key from the environment and passes it on
const parentEnv = process.env;

function resolveKey() {
  if (parentEnv.OPENROUTER_API_KEY) {
    return parentEnv.OPENROUTER_API_KEY;
  }
  const auth = JSON.parse(readFileSync(`${os.homedir()}/.pi/agent/auth.json`, "utf8"));
  const key = auth.openrouter.key;
  if (!key.startsWith("!")) {
    return key;
  }
  return execSync(key.slice(1), { encoding: "utf8" }).trim().split("\n")[0];
}

const names = process.argv.slice(2);
const selected = names.length > 0 ? names : Object.keys(sheets);
const env = { ...parentEnv, OPENROUTER_API_KEY: resolveKey(), GEN_SIZE: "2K" };
const run = promisify(execFile);

const results = await Promise.allSettled(
  selected.map(async (name) => {
    const sheet = sheets[name];
    if (!sheet) {
      throw new Error(`unknown sheet: ${name}`);
    }
    const out = `scratch/generated/sheet-${name}.png`;
    const args = ["tools/gen-image.mjs", model, out, `${style} ${sheet.prompt}`, ...refs];
    const { stdout } = await run("node", args, {
      cwd: root,
      env: { ...env, GEN_ASPECT: sheet.aspect },
    });
    return stdout.trim().split(" usage ")[0];
  }),
);

for (const [index, result] of results.entries()) {
  const detail = result.status === "fulfilled" ? result.value : `FAILED ${result.reason?.message}`;
  console.log(`${selected[index]}: ${detail}`);
}
if (results.some((result) => result.status === "rejected")) {
  process.exitCode = 1;
}
