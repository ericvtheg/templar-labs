// Round two: where each piece of text sits on Emma's second Canva export.
//
// The numbers in spec.json were fitted to her screenshots by tools/fit-canva.mjs,
// which overlays the page on the reference and corrects position and size until
// the ink lines up. Do not tune them by hand; rerun the tool.

import { box, createSheet } from "../canva/sheet.ts";
import raw from "./spec.json" with { type: "json" };

/** Where Emma's two illustrations sit, measured from her screenshots. */
export const artBoxes = {
  bouquetTop: box(676.25, 77.25, 612.25),
  bouquetLetter: box(27, 106, 612.25),
  lily: box(0, 255, 490),
} as const;

/** The thin rules between the things to do, as tops in panel pixels. */
export const thingsRules = [186, 327, 453, 601] as const;

/** Emma's own line breaks on a wide screen. Each entry is the end of a line. */
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

export const sheet = createSheet(raw, lineEnds);
export const { place, linesFor } = sheet;
