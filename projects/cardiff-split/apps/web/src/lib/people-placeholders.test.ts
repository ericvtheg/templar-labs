import { describe, expect, test } from "vitest";
import {
  initialPeoplePlaceholderNames,
  MAX_VISIBLE_PEOPLE_PLACEHOLDERS,
  nextPeoplePlaceholderNames,
  PEOPLE_PLACEHOLDER_CYCLE_LENGTH,
  PEOPLE_PLACEHOLDER_NAMES,
} from "./people-placeholders.ts";

describe("people placeholders", () => {
  test("starts with a shuffled cycle of every placeholder name", () => {
    const names = initialPeoplePlaceholderNames(() => 0);

    expect(names).toHaveLength(PEOPLE_PLACEHOLDER_CYCLE_LENGTH);
    expect(new Set(names)).toEqual(new Set(PEOPLE_PLACEHOLDER_NAMES));
    expect(names).not.toEqual(PEOPLE_PLACEHOLDER_NAMES);
  });

  test("keeps the visible placeholder limit separate from the cycle length", () => {
    expect(MAX_VISIBLE_PEOPLE_PLACEHOLDERS).toBeLessThan(PEOPLE_PLACEHOLDER_CYCLE_LENGTH);
  });

  test("cycles the bottom name to the top", () => {
    const nextNames = nextPeoplePlaceholderNames(["Fiona", "Emma", "Eric", "K'love"]);

    expect(nextNames).toEqual(["K'love", "Fiona", "Emma", "Eric"]);
  });

  test("returns to the initial order after a full cycle", () => {
    const currentNames = initialPeoplePlaceholderNames(() => 0);
    let nextNames = currentNames;

    for (let index = 0; index < PEOPLE_PLACEHOLDER_CYCLE_LENGTH; index += 1) {
      nextNames = nextPeoplePlaceholderNames(nextNames);
    }

    expect(nextNames).toEqual(currentNames);
  });
});
