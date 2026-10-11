// Where each piece of text sits on Emma's Canva panels.
//
// Every panel is 1366 x 768 "panel pixels", the size of her Canva pages. The
// numbers in spec.json were fitted to her screenshots by tools/fit-canva.mjs,
// which overlays this page on the reference and corrects position and size
// until the ink lines up. Do not tune them by hand; rerun the tool.

import type { CSSProperties } from "react";
import raw from "./spec.json" with { type: "json" };

export type BlockSpec = {
  /** Left edge, or the center line for centered text. */
  x: number;
  /** Top of the first line box. */
  y: number;
  /** Font size. */
  size: number;
  /** Distance between baselines. */
  pitch: number;
  /** Box width, for text that wraps or is centered. */
  w?: number;
  /** Letter-spacing in em. Only display type has any. */
  ls?: number;
};

const blocks: Record<string, BlockSpec> = raw;

export const panel = { width: 1366, height: 768 } as const;

/** CSS variables that place a block. The stylesheet turns them into positions. */
export function place(id: string): CSSProperties {
  const block = blocks[id];
  if (!block) {
    throw new Error(`No Canva position for "${id}". Add it to spec.json.`);
  }
  return {
    "--x": block.x,
    "--y": block.y,
    "--fs": block.size,
    "--pitch": block.pitch,
    ...(block.w === undefined ? {} : { "--w": block.w }),
    ...(block.ls === undefined ? {} : { "--ls": block.ls }),
  } as CSSProperties;
}

/** A box on a panel: left, top, width and (optionally) height, in panel pixels. */
export function box(x: number, y: number, w: number, h?: number): CSSProperties {
  return {
    "--x": x,
    "--y": y,
    "--w": w,
    ...(h === undefined ? {} : { "--bh": h }),
  } as CSSProperties;
}

/** Where Emma's two illustrations sit, measured from her screenshots. */
export const artBoxes = {
  bouquetTop: box(676.25, 77.25, 612.25),
  bouquetLetter: box(27, 106, 612.25),
  lily: box(0, 255, 490),
} as const;

/** The thin rules between the things to do, as tops in panel pixels. */
export const thingsRules = [186, 327, 453, 601] as const;

/**
 * Emma's own line breaks on a wide screen. Each entry is the end of a line.
 * On a phone the text reflows and these are ignored.
 */
export const lineEnds: Record<string, readonly string[]> = {
  "faq.heading": ["Asked"],
  "faq.a.indoor-or-outdoors": ["will be held", "The ceremony"],
  "welcome.details": ["where and", "in town", "welcome party"],
  "travel.p1": ["ICT.", "flights from"],
  "travel.p2": ["where you stay,"],
  "travel.p3": ["used to in Los", "ride ahead of"],
  "travel.p4": ["within walking"],
  "things.i1.text": ["our officiant,", "their amazing"],
  "things.i2.text": ["You might"],
};

/** Splits text into Emma's lines. Text that no longer contains a break point stays whole. */
export function linesFor(id: string, text: string): string[] {
  const lines: string[] = [];
  let rest = text;
  for (const end of lineEnds[id] ?? []) {
    const at = rest.indexOf(end);
    if (at === -1) {
      continue;
    }
    lines.push(rest.slice(0, at + end.length).trim());
    rest = rest.slice(at + end.length);
  }
  if (rest.trim() !== "") {
    lines.push(rest.trim());
  }
  return lines;
}
