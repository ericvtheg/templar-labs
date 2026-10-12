// Round three: where each piece of text sits on Emma's third Canva export
// (reference/round-3). Version 6 reproduces it exactly.
//
// The numbers in spec.json are fitted to her screenshots by
// `node tools/fit-canva.mjs --round 3`. Do not tune them by hand.

import { box, createSheet } from "../canva/sheet.ts";
import raw from "./spec.json" with { type: "json" };

/** Where her art, lettering and photo sit, in panel pixels (from tools/round3.py). */
export const boxes = {
  bouquet: box(676.25, 77.25, 612.25),
  tagline: box(85.75, 545.5, 414.5),
  photo: box(68, 150, 645, 468),
  letter: box(743, 152.25, 505.75),
  dayFriday: box(531.5, 194.75, 301.25),
  daySaturday: box(516.75, 176, 333.5),
  lily: box(0, 255, 490),
  faqFlowers: box(0, 330, 500),
} as const;

/** The thin rules between the things to do, as tops in panel pixels. */
export const thingsRules = [186, 327, 453, 601] as const;

/** The centers of the three hotel columns. */
export const hotelCenters = [256, 682, 1100] as const;

/** Emma's own line breaks on a wide screen. Each entry is the end of a line. */
export const lineEnds: Record<string, readonly string[]> = {
  "welcome.details": ["where and", "but if", "planning a"],
  "flight.p1": ["Eisenhower"],
  "flight.p2": ["away from", "direct flights", "options daily"],
  "around.p1": ["But, depending", "weekend without a"],
  "around.p2": ["there are fewer", "in Los Angeles.", "the wedding, we", "ahead of time and"],
  "around.p3": ["there are plenty of"],
  "things.i1.text": ["our officiant,", "their amazing"],
  "things.i2.text": ["You might"],
  "faq.heading": ["Asked"],
  "faq.a.indoor-or-outdoors.0": ["will be held", "The ceremony"],
  "faq.a.weather.0": ["and evening", "if you get", "forecast that"],
  "faq.a.dress-code.0": ["button-downs,"],
  "faq.a.kids.0": ["accommodate the"],
  "faq.a.plus-ones.0": ["the option to"],
  "faq.a.getting-to-wichita.0": ["The airport is", "from California to"],
  "faq.a.what-is-wichita-like.0": ["breweries,", "nowhere but"],
  "faq.a.rental-car.0": ["allow extra time", "not as many as", "make sure you"],
  "faq.a.rental-car.1": ["ahead of time.", "there are walkable"],
};

export const sheet = createSheet(raw, lineEnds);
export const { place, linesFor } = sheet;
