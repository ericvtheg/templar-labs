import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseArgs } from "node:util";

// Curated anchors, not arbitrary RGB noise. Final semantic pairs are checked below.
const hues = [
  { id: "cobalt", light: "#2459C5", dark: "#8FB5FF" },
  { id: "vermilion", light: "#B93827", dark: "#FFAD94" },
  { id: "violet", light: "#6941C6", dark: "#C3AEFF" },
  { id: "teal", light: "#087C73", dark: "#76DBCA" },
  { id: "ochre", light: "#825B00", dark: "#FFD76B" },
  { id: "berry", light: "#A12D65", dark: "#F4A6CC" },
  { id: "indigo", light: "#4F46E5", dark: "#ADA8FF" },
  { id: "evergreen", light: "#246346", dark: "#82CEA3" },
  { id: "copper", light: "#A44D08", dark: "#FFBD80" },
  { id: "cyan", light: "#02658A", dark: "#75D6F4" },
];
const surfaces = [
  {
    id: "paper",
    mode: "light",
    canvas: "#FAF7F2",
    surface: "#FFFFFF",
    text: "#24211D",
    muted: "#625A51",
    border: "#847B71",
  },
  {
    id: "porcelain",
    mode: "light",
    canvas: "#F7F8FC",
    surface: "#FFFFFF",
    text: "#162033",
    muted: "#526078",
    border: "#778397",
  },
  {
    id: "chalk",
    mode: "light",
    canvas: "#F4F6F2",
    surface: "#FFFFFF",
    text: "#1C2620",
    muted: "#4E6355",
    border: "#768679",
  },
  {
    id: "lilac",
    mode: "light",
    canvas: "#F7F4FB",
    surface: "#FFFFFF",
    text: "#292035",
    muted: "#655875",
    border: "#877795",
  },
  {
    id: "ink",
    mode: "dark",
    canvas: "#11151C",
    surface: "#1C2430",
    text: "#F7FAFF",
    muted: "#ADB9CD",
    border: "#738196",
  },
  {
    id: "night-plum",
    mode: "dark",
    canvas: "#191321",
    surface: "#282034",
    text: "#FAF4FF",
    muted: "#C1AECE",
    border: "#9076A1",
  },
];
const typography = [
  {
    id: "humanist",
    display: "Manrope",
    body: "Source Sans 3",
    character: "Open, clear, approachable",
  },
  {
    id: "grotesk",
    display: "Space Grotesk",
    body: "IBM Plex Sans",
    character: "Sharp, contemporary, expressive",
  },
  {
    id: "editorial",
    display: "Fraunces",
    body: "Public Sans",
    character: "Expressive reading-led hierarchy",
  },
  {
    id: "institutional",
    display: "Libre Baskerville",
    body: "IBM Plex Sans",
    character: "Measured, durable, authoritative",
  },
  {
    id: "technical",
    display: "IBM Plex Mono",
    body: "Inter",
    character: "Precise, tool-like, systematic",
  },
  {
    id: "energetic",
    display: "Bricolage Grotesque",
    body: "DM Sans",
    character: "Warm, bold, conversational",
  },
  {
    id: "utilitarian",
    display: "Archivo",
    body: "Atkinson Hyperlegible",
    character: "Direct, practical, legibility-led",
  },
];
const geometry = [
  {
    id: "square",
    controlRadius: 0,
    cardRadius: 0,
    character: "Straight edges; typography carries expression",
  },
  { id: "crisp", controlRadius: 4, cardRadius: 8, character: "Compact corners; ruled divisions" },
  {
    id: "soft",
    controlRadius: 8,
    cardRadius: 16,
    character: "Soft rectangular surfaces, not pills everywhere",
  },
  {
    id: "round",
    controlRadius: 14,
    cardRadius: 24,
    character: "Generous rounded shapes; strong grouping",
  },
  {
    id: "capsule",
    controlRadius: 24,
    cardRadius: 12,
    character: "Capsule actions against more structured content",
  },
];
const compositions = [
  "document-first-split-pane",
  "top-navigation-and-canvas",
  "compact-command-workbench",
  "single-purpose-centered-flow",
  "editorial-columns",
  "stacked-feed",
  "modular-grid",
];
const densities = ["compact", "balanced", "spacious"];
const graphics = [
  "bold-solid-icons",
  "precise-linework",
  "duotone-cutouts",
  "oversized-type",
  "geometric-diagrams",
  "organic-contours",
];
const motions = [
  "quiet-fades",
  "snappy-state-transitions",
  "restrained-slides",
  "no-decorative-motion",
];
const fingerprintKeys = [
  "palette",
  "surface",
  "typography",
  "geometry",
  "composition",
  "density",
  "graphics",
];
const nonColorKeys = ["typography", "geometry", "composition", "density", "graphics"];
const paletteRoles = [
  "canvas",
  "surface",
  "text",
  "muted",
  "border",
  "primary",
  "onPrimary",
  "accent",
  "onAccent",
  "focus",
  "danger",
  "success",
  "warning",
];

function channels(hex) {
  if (typeof hex !== "string" || !/^#[\da-f]{6}$/i.test(hex)) {
    throw new Error(`Expected an opaque six-digit hex color, received ${String(hex)}.`);
  }
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

// WCAG 2.2 sRGB relative luminance; thresholds are compared without rounding.
export function contrastRatio(first, second) {
  const luminance = (hex) => {
    const linear = channels(hex).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function checkPalette(palette) {
  if (!palette || typeof palette !== "object" || Array.isArray(palette)) {
    throw new Error("A semantic palette object is required.");
  }
  for (const role of paletteRoles) {
    channels(palette[role]);
  }
  const checks = [];
  for (const background of ["canvas", "surface"]) {
    for (const foreground of [
      "text",
      "muted",
      "primary",
      "accent",
      "danger",
      "success",
      "warning",
      "focus",
      "border",
    ]) {
      const minimum = foreground === "border" || foreground === "focus" ? 3 : 4.5;
      const ratio = contrastRatio(palette[foreground], palette[background]);
      if (ratio < minimum) {
        throw new Error(
          `${foreground}/${background} contrast is ${ratio.toFixed(3)}:1; requires ${minimum}:1.`,
        );
      }
      checks.push({ foreground, background, ratio, minimum });
    }
  }
  for (const [foreground, background] of [
    ["onPrimary", "primary"],
    ["onAccent", "accent"],
  ]) {
    const ratio = contrastRatio(palette[foreground], palette[background]);
    if (ratio < 4.5) {
      throw new Error(`${foreground}/${background} requires 4.5:1 contrast.`);
    }
    checks.push({ foreground, background, ratio, minimum: 4.5 });
  }
  return checks;
}

function readable(anchor, backgrounds, mode) {
  let color = anchor;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (backgrounds.every((background) => contrastRatio(color, background) >= 4.5)) {
      return color;
    }
    color = `#${channels(color)
      .map((channel) => {
        const adjusted =
          mode === "light" ? Math.floor(channel * 0.9) : Math.ceil(channel + (255 - channel) * 0.1);
        return adjusted.toString(16).padStart(2, "0");
      })
      .join("")}`;
  }
  throw new Error("Unable to generate a readable semantic color.");
}

function onColor(color) {
  return contrastRatio("#FFFFFF", color) >= contrastRatio("#000000", color) ? "#FFFFFF" : "#000000";
}

function makePalette(family, secondary, surface) {
  const backgrounds = [surface.canvas, surface.surface];
  const primary = readable(family[surface.mode], backgrounds, surface.mode);
  const accent = readable(secondary[surface.mode], backgrounds, surface.mode);
  const feedback =
    surface.mode === "light"
      ? { danger: "#B91C1C", success: "#166534", warning: "#855600" }
      : { danger: "#FFA0A0", success: "#82CEA3", warning: "#FFD76B" };
  return {
    canvas: surface.canvas,
    surface: surface.surface,
    text: surface.text,
    muted: surface.muted,
    border: surface.border,
    primary,
    onPrimary: onColor(primary),
    accent,
    onAccent: onColor(accent),
    focus: primary,
    danger: readable(feedback.danger, backgrounds, surface.mode),
    success: readable(feedback.success, backgrounds, surface.mode),
    warning: readable(feedback.warning, backgrounds, surface.mode),
  };
}

function validateFingerprint(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    fingerprintKeys.some((key) => typeof value[key] !== "string" || !value[key].trim())
  ) {
    throw new Error(`A fingerprint must contain string values for ${fingerprintKeys.join(", ")}.`);
  }
  return value;
}

export function nonColorDistance(first, second) {
  validateFingerprint(first);
  validateFingerprint(second);
  return nonColorKeys.filter((key) => first[key] !== second[key]).length;
}

export function generateDirections({
  product,
  seed = randomBytes(16).toString("hex"),
  count = 3,
  mode = "any",
  avoid = [],
}) {
  if (typeof product !== "string" || !product.trim() || product.length > 200) {
    throw new Error("Provide a product name of 1–200 characters.");
  }
  if (typeof seed !== "string" || !seed.trim() || seed.length > 500) {
    throw new Error("The seed must contain 1–500 characters.");
  }
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    throw new Error("Count must be an integer from 1 to 5.");
  }
  if (!["any", "light", "dark"].includes(mode)) {
    throw new Error("Mode must be any, light, or dark.");
  }
  if (!Array.isArray(avoid) || avoid.length > 100) {
    throw new Error("Avoid must be an array of at most 100 fingerprints.");
  }
  avoid.forEach(validateFingerprint);
  const directions = [];
  const allowedSurfaces = surfaces.filter((surface) => mode === "any" || surface.mode === mode);
  for (let attempt = 0; attempt < 2000 && directions.length < count; attempt++) {
    const choose = (items, dimension) => {
      const hash = createHash("sha256")
        .update(JSON.stringify([product.trim(), seed, attempt, dimension]))
        .digest();
      return items[hash.readUInt32BE(0) % items.length];
    };
    const family = choose(hues, "palette");
    const secondary = choose(
      hues.filter((hue) => hue.id !== family.id),
      "accent",
    );
    const surface = choose(allowedSurfaces, "surface");
    const type = choose(typography, "typography");
    const shape = choose(geometry, "geometry");
    const composition = choose(compositions, "composition");
    const density = choose(densities, "density");
    const graphic = choose(graphics, "graphics");
    const fingerprint = {
      palette: family.id,
      surface: surface.id,
      typography: type.id,
      geometry: shape.id,
      composition,
      density,
      graphics: graphic,
    };
    if (
      [...avoid, ...directions.map((direction) => direction.fingerprint)].some(
        (previous) => nonColorDistance(fingerprint, previous) < 3,
      )
    ) {
      continue;
    }
    const palette = makePalette(family, secondary, surface);
    directions.push({
      id: `direction-${directions.length + 1}`,
      fingerprint,
      mode: surface.mode,
      palette,
      typography: type,
      geometry: shape,
      composition,
      density,
      graphics: graphic,
      motion: choose(motions, "motion"),
      contrastChecks: checkPalette(palette),
    });
  }
  if (directions.length !== count) {
    throw new Error(
      "Cannot satisfy distinctness constraints. Reduce the recent-brand set or request fewer candidates; do not silently accept a collision.",
    );
  }
  return { version: 1, product: product.trim(), seed, directions };
}

export function validateIdentity(identity) {
  const direction = identity?.direction ?? identity;
  validateFingerprint(direction?.fingerprint);
  checkPalette(direction.palette);
  if (
    !["light", "dark"].includes(direction.mode) ||
    direction.typography?.id !== direction.fingerprint.typography ||
    direction.geometry?.id !== direction.fingerprint.geometry ||
    ["composition", "density", "graphics"].some(
      (key) => direction[key] !== direction.fingerprint[key],
    )
  ) {
    throw new Error(
      "The direction and fingerprint must describe the same identity and a light/dark mode.",
    );
  }
  for (const font of [direction.typography?.display, direction.typography?.body]) {
    if (typeof font !== "string" || !/^[\p{L}\d -]{1,120}$/u.test(font)) {
      throw new Error("Display and body fonts must be plain font-family names.");
    }
  }
  for (const key of ["controlRadius", "cardRadius"]) {
    const value = direction.geometry?.[key];
    if (!Number.isFinite(value) || value < 0 || value > 48) {
      throw new Error(`${key} must be a number from 0 to 48.`);
    }
  }
  return direction;
}

export function toCss(identity) {
  const direction = validateIdentity(identity);
  const declarations = paletteRoles.map((role) => {
    const name = role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return `  --brand-${name}: ${direction.palette[role]};`;
  });
  const fallback = ["editorial", "institutional"].includes(direction.typography.id)
    ? "serif"
    : direction.typography.id === "technical"
      ? "monospace"
      : "sans-serif";
  declarations.push(
    `  --brand-font-display: ${JSON.stringify(direction.typography.display)}, ${fallback};`,
    `  --brand-font-body: ${JSON.stringify(direction.typography.body)}, sans-serif;`,
    `  --brand-radius-control: ${direction.geometry.controlRadius}px;`,
    `  --brand-radius-card: ${direction.geometry.cardRadius}px;`,
  );
  return `/* Brand primitives: map these to the owning app's semantic tokens. */\n:root {\n${declarations.join("\n")}\n}\n`;
}

async function loadJson(path) {
  const contents = await readFile(path, "utf8");
  if (contents.length > 250_000) {
    throw new Error(`Brand artifact is too large: ${path}`);
  }
  return JSON.parse(contents);
}

async function main() {
  const { values } = parseArgs({
    options: {
      product: { type: "string" },
      seed: { type: "string" },
      count: { type: "string", default: "3" },
      mode: { type: "string", default: "any" },
      avoid: { type: "string", multiple: true },
      check: { type: "string" },
      css: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(
      "Generate: node generate.mjs --product NAME [--seed SEED] [--count 1..5] [--mode any|light|dark] [--avoid identity.json ...]\nValidate: node generate.mjs --check identity.json\nCSS: node generate.mjs --css identity.json\nAn identity file contains one chosen direction, optionally under a direction key. No files are written by this script.\n",
    );
    return;
  }
  if (values.check && values.css) {
    throw new Error("Choose either --check or --css.");
  }
  if (values.check || values.css) {
    const direction = validateIdentity(await loadJson(values.check ?? values.css));
    process.stdout.write(
      values.css
        ? toCss(direction)
        : `${JSON.stringify({ valid: true, contrastChecks: checkPalette(direction.palette) }, null, 2)}\n`,
    );
    return;
  }
  const avoid = [];
  for (const path of values.avoid ?? []) {
    // eslint-disable-next-line no-await-in-loop -- Small local artifacts are read serially to bound memory.
    const identity = await loadJson(path);
    avoid.push(validateIdentity(identity).fingerprint);
  }
  const result = generateDirections({
    product: values.product,
    seed: values.seed,
    count: Number(values.count),
    mode: values.mode,
    avoid,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
