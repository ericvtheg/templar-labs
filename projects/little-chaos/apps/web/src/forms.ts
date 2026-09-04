export const PARTICLE_COUNT = 32_000;
export const FORM_NAMES = ["saturn", "galaxy", "bloom", "helix", "word"] as const;
export type FormName = (typeof FORM_NAMES)[number];
export const PALETTE_NAMES = ["dusk", "ocean", "ember", "silver"] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];
export type SceneState = { form: FormName; palette: PaletteName; energy: number; word: string };
export const captions: Record<FormName, [string, string]> = {
  saturn: ["001", "A pale blue thought"],
  galaxy: ["002", "Somewhere, everything begins"],
  bloom: ["003", "Nothing stays a seed forever"],
  helix: ["004", "A beautiful little accident"],
  word: ["005", "A thought, held together"],
};
export const palettes: Record<
  PaletteName,
  { a: [number, number, number]; b: [number, number, number]; accent: string }
> = {
  dusk: { a: [1, 0.68, 0.46], b: [0.56, 0.42, 1], accent: "#cfb6fa" },
  ocean: { a: [0.43, 1, 0.73], b: [0.25, 0.53, 1], accent: "#a4e8d4" },
  ember: { a: [1, 0.81, 0.36], b: [1, 0.22, 0.13], accent: "#ffc092" },
  silver: { a: [1, 0.96, 0.91], b: [0.49, 0.63, 0.79], accent: "#d4dde5" },
};

export function randomGenerator(seed = 42): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeWord(word: string): string {
  return Array.from(
    word
      .replace(/[\p{Cc}\p{Cf}]/gu, "")
      .trim()
      .toUpperCase(),
  )
    .slice(0, 12)
    .join("");
}

export function readState(search: string): SceneState {
  const params = new URLSearchParams(search);
  const form = params.get("form");
  const palette = params.get("palette");
  const parsedEnergy = Number(params.get("energy") ?? 35);
  return {
    form: FORM_NAMES.find((name) => name === form) ?? "saturn",
    palette: PALETTE_NAMES.find((name) => name === palette) ?? "dusk",
    energy: Number.isFinite(parsedEnergy) ? Math.max(0, Math.min(100, parsedEnergy)) : 35,
    word: normalizeWord(params.get("word") ?? "") || "HELLO",
  };
}

export function writeState(state: SceneState): string {
  return new URLSearchParams({
    form: state.form,
    palette: state.palette,
    energy: String(state.energy),
    word: state.word,
  }).toString();
}

export function createForm(form: Exclude<FormName, "word">, count = PARTICLE_COUNT): Float32Array {
  const data = new Float32Array(count * 3);
  const random = randomGenerator();
  const tau = Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const u = random();
    const v = random();
    const w = random();
    let x = 0;
    let y = 0;
    let z = 0;
    if (form === "saturn") {
      if (i < count * 0.46) {
        const theta = u * tau;
        const cosPhi = v * 2 - 1;
        const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
        const r = 1.24 + Math.sin(cosPhi * 60) * 0.007 + w * 0.025;
        x = Math.cos(theta) * sinPhi * r;
        y = cosPhi * r;
        z = Math.sin(theta) * sinPhi * r;
      } else {
        const theta = u * tau;
        const band = v < 0.55 ? 1.72 + (v / 0.55) * 0.48 : 2.29 + ((v - 0.55) / 0.45) * 0.73;
        x = Math.cos(theta) * band;
        y = (w - 0.5) * 0.03;
        z = Math.sin(theta) * band;
      }
      const yy = y * 0.84 - z * 0.54;
      const zz = y * 0.54 + z * 0.84;
      y = yy;
      z = zz;
      const xx = x * 0.94 - y * -0.342;
      y = x * -0.342 + y * 0.94;
      x = xx;
    } else if (form === "galaxy") {
      const r = u ** 0.65 * 2.85;
      const arm = i % 4;
      const theta = (arm * Math.PI) / 2 + r * 1.65 + (v - 0.5) * (0.2 + u * 0.7);
      x = Math.cos(theta) * r;
      z = Math.sin(theta) * r;
      y = (w - 0.5) * (0.16 + 0.22 * (1 - u));
      const yy = y * 0.73 - z * 0.68;
      z = y * 0.68 + z * 0.73;
      y = yy;
      const xx = x * 0.95 + y * 0.31;
      y = -x * 0.31 + y * 0.95;
      x = xx;
    } else if (form === "bloom") {
      const theta = u * tau;
      const r = Math.sqrt(v) * (1.7 + 0.77 * Math.cos(theta * 5));
      const layer = i % 3;
      const angle = theta + layer * 0.28;
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
      z = Math.sin(r * 1.9 - 0.8) * 0.55 + layer * 0.13 + (w - 0.5) * 0.06;
    } else {
      const height = (u - 0.5) * 4.4;
      const theta = height * 2.8 + (i % 2) * Math.PI;
      const rung = i % 7 === 0;
      const r = rung ? (v * 2 - 1) * 0.88 : 0.88 + (v - 0.5) * 0.14;
      x = Math.cos(theta) * r;
      y = height;
      z = Math.sin(theta) * r + (w - 0.5) * 0.1;
      const xx = x * 0.87 + y * 0.49;
      y = -x * 0.49 + y * 0.87;
      x = xx;
    }
    data[i * 3] = x;
    data[i * 3 + 1] = y;
    data[i * 3 + 2] = z;
  }
  return data;
}

export function createWord(word: string, count = PARTICLE_COUNT): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 350;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Your browser could not create the text canvas.");
  }
  ctx.fillStyle = "white";
  const safeWord = normalizeWord(word) || "HELLO";
  ctx.font = "900 240px Arial, sans-serif";
  const fontSize = Math.min(250, (240 * 1050) / Math.max(ctx.measureText(safeWord).width, 1));
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(safeWord, 600, 175);
  const pixels = ctx.getImageData(0, 0, 1200, 350).data;
  const points: [number, number][] = [];
  for (let y = 0; y < 350; y += 2) {
    for (let x = 0; x < 1200; x += 2) {
      if ((pixels[(y * 1200 + x) * 4 + 3] ?? 0) > 100) {
        points.push([x, y]);
      }
    }
  }
  if (!points.length) {
    throw new Error("Try a word with visible letters or symbols.");
  }
  const result = new Float32Array(count * 3);
  const random = randomGenerator();
  for (let i = 0; i < count; i++) {
    const point = points[Math.floor(random() * points.length)] ?? [600, 175];
    result[i * 3] = (point[0] - 600 + random() * 2) / 205;
    result[i * 3 + 1] = -(point[1] - 175 + random() * 2) / 205;
    result[i * 3 + 2] = (random() - 0.5) * 0.18;
  }
  return result;
}
