import { clamp } from "./analysis.ts";
import type { RhythmAnalysis } from "./rhythm.ts";

type Key = readonly [number, number];

function track(position: number, keys: readonly Key[]): number {
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (a && b && position <= b[0]) {
      const t = clamp((position - a[0]) / (b[0] - a[0]));
      return a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t);
    }
  }
  return keys.at(-1)?.[1] ?? 0;
}

// Authored eight-beat action clips. Audio triggers a clip; its joints keep moving
// through anticipation, action, hold and recovery after the transient has decayed.
const reach: readonly Key[] = [
  [0, 0],
  [0.7, -0.15],
  [2.2, 1],
  [3.7, 1],
  [5.8, 0],
  [8, 0],
];
const grip: readonly Key[] = [
  [0, 0.7],
  [1.5, 0],
  [2.8, 0],
  [3.6, 1],
  [4.8, 1],
  [6.3, 0.7],
  [8, 0.7],
];
const jaw: readonly Key[] = [
  [0, 0],
  [1.1, 0],
  [2.0, 0.9],
  [3.8, 1],
  [5.5, 0],
  [8, 0],
];
const lunge: readonly Key[] = [
  [0, 0],
  [1.0, -0.22],
  [2.0, 1],
  [3.5, 0.85],
  [6, 0],
  [8, 0],
];
const turn: readonly Key[] = [
  [0, -0.25],
  [1.3, 0.3],
  [2.6, 0],
  [4, 0],
  [6.3, -0.35],
  [8, -0.25],
];
const bank: readonly Key[] = [
  [0, -0.35],
  [1.2, -0.45],
  [3, 0.4],
  [4.5, 0.45],
  [6.2, -0.1],
  [8, -0.35],
];

export function sampleChoreography(
  analysis: RhythmAnalysis | null,
  time: number,
  beat: number,
  reducedMotion = false,
) {
  const beatDuration = 60 / (analysis?.bpm ?? 128);
  const phrase = analysis
    ? Math.floor(Math.max(0, beat - 1) / 8)
    : Math.floor(time / beatDuration / 8);
  const start = analysis ? (analysis.kicks[phrase * 8]?.time ?? 0) : phrase * 8 * beatDuration;
  const position = clamp((time - start) / beatDuration, 0, 8);
  const scale = reducedMotion ? 0.08 : 1;
  return {
    reachLeft: track(position, reach) * scale,
    reachRight: track(Math.max(0, position - 0.65), reach) * scale,
    grip: track(position, grip),
    jawOpen: track(position, jaw) * scale,
    lunge: track(position, lunge) * scale,
    headTurn: track(position, turn) * scale,
    bank: track(position, bank) * scale,
    laserCue: reducedMotion ? 0 : phrase % 4,
    laserPhase: reducedMotion ? 0 : position / 8,
    titleReveal: reducedMotion
      ? 1
      : track(position, [
          [0, 0],
          [0.65, 0],
          [1.7, 1],
          [5.6, 1],
          [6.8, 0],
          [8, 0],
        ]),
    titleScatter: reducedMotion
      ? 0
      : track(position, [
          [0, 1],
          [0.6, 1],
          [2, 0],
          [4.5, 0],
          [6.8, 1],
          [8, 1],
        ]),
    titleTravel: reducedMotion
      ? 0
      : track(position, [
          [0, -1],
          [2, 0],
          [4.5, 0],
          [6.8, 1],
          [8, 1],
        ]),
  };
}

export type Choreography = ReturnType<typeof sampleChoreography>;
