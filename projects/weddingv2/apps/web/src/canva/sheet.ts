// A "sheet" is the measured layout of one round of Emma's Canva design: where
// each piece of text sits on her pages, and where her own lines break.
//
// Every Canva page is a panel of 1366 x 768 "panel pixels". The positions come
// from a spec.json that tools/fit-canva.mjs fits to her screenshots.

import type { CSSProperties } from "react";

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

export type Sheet = {
  /** CSS variables that place a block. The stylesheet turns them into positions. */
  place: (id: string) => CSSProperties;
  /** Splits text into Emma's lines. Text without a break point stays whole. */
  linesFor: (id: string, text: string) => string[];
};

export const panel = { width: 1366, height: 768 } as const;

/** A box on a panel: left, top, width and (optionally) height, in panel pixels. */
export function box(x: number, y: number, w: number, h?: number): CSSProperties {
  return {
    "--x": x,
    "--y": y,
    "--w": w,
    ...(h === undefined ? {} : { "--bh": h }),
  } as CSSProperties;
}

/**
 * @param blocks   positions from spec.json
 * @param lineEnds Emma's own line breaks on a wide screen. Each entry is the end
 *                 of a line. On a phone the text reflows and these are ignored.
 */
export function createSheet(
  blocks: Record<string, BlockSpec>,
  lineEnds: Record<string, readonly string[]>,
): Sheet {
  return {
    place(id) {
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
    },
    linesFor(id, text) {
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
    },
  };
}
