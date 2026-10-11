// Where everything lies on the table. All measures are panel pixels on a
// 1366 x 768 table, the same panel the Canva design uses.

import type { PageId } from "../content/pages.ts";
import type { ArtName } from "../shared/art.ts";

export const panel = { width: 1366, height: 768 } as const;

export type Spot = {
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees. */
  r: number;
  /** Stacking order. */
  z: number;
};

export type SectionId = Exclude<PageId, "home">;

/** The section cards, in the order they leave the envelope and in reading order. */
export const sectionOrder: readonly SectionId[] = [
  "schedule",
  "travel",
  "stay",
  "things-to-do",
  "faq",
];

export const envelopeSpot = {
  closed: { x: 423, y: 214, w: 520, h: 340, r: 0, z: 30 },
  resting: { x: 1010, y: -92, w: 520, h: 340, r: 13, z: 1 },
} as const satisfies Record<string, Spot>;

export const invitationSpot: Spot = { x: 487, y: 92, w: 392, h: 566, r: -1.2, z: 8 };

export const cardSpots: Record<SectionId, Spot> = {
  schedule: { x: 134, y: 58, w: 232, h: 312, r: -7, z: 6 },
  travel: { x: 74, y: 468, w: 304, h: 198, r: 4, z: 7 },
  stay: { x: 1112, y: 262, w: 216, h: 290, r: -5, z: 6 },
  "things-to-do": { x: 902, y: 404, w: 232, h: 308, r: 4, z: 9 },
  faq: { x: 1158, y: 566, w: 196, h: 172, r: 9, z: 10 },
};

/** Polaroids, hero first, in the order of the photo slots. */
export const polaroidSpots: readonly Spot[] = [
  { x: 918, y: 70, w: 224, h: 268, r: 6, z: 5 },
  { x: 330, y: 316, w: 176, h: 212, r: 8, z: 4 },
  { x: 372, y: 552, w: 172, h: 206, r: -7, z: 9 },
  { x: 350, y: 24, w: 152, h: 182, r: -11, z: 3 },
];

export type Pressed = Spot & { art: ArtName };

/** Pressed flowers lying between the cards. */
export const pressedFlowers: readonly Pressed[] = [
  { art: "stemLily", x: 24, y: 330, w: 92, h: 174, r: -62, z: 2 },
  { art: "stemCosmos", x: 870, y: 318, w: 72, h: 166, r: 38, z: 4 },
  { art: "stemSprig", x: 610, y: 648, w: 52, h: 156, r: 82, z: 2 },
  { art: "stemBuds", x: 1262, y: 100, w: 62, h: 178, r: 24, z: 2 },
  { art: "stemRose", x: 6, y: 628, w: 70, h: 136, r: -24, z: 2 },
];

/** The sheet a card grows into. */
export const sheet = { width: 1070, height: 706 } as const;

/** Screen pixels per panel pixel for a window of this size. */
export function unitFor(width: number, height: number): number {
  return Math.min(width / panel.width, height / panel.height, 1.45);
}

export function boxStyle(
  spot: Spot,
  unit: number,
): { width: number; height: number; zIndex: number } {
  return { width: spot.w * unit, height: spot.h * unit, zIndex: spot.z };
}
