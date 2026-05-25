import { describe, expect, test } from "vitest";
import {
  initialPeoplePlaceholderNames,
  MAX_VISIBLE_PEOPLE_PLACEHOLDERS,
  nextPeoplePlaceholderNames,
  PEOPLE_PLACEHOLDER_NAMES,
} from "./people-placeholders.ts";

describe("people placeholders", () => {
  test("starts with at most six names", () => {
    expect(initialPeoplePlaceholderNames()).toEqual(
      PEOPLE_PLACEHOLDER_NAMES.slice(0, MAX_VISIBLE_PEOPLE_PLACEHOLDERS),
    );
  });

  test("adds a non-visible name at the top and drops the bottom name", () => {
    const currentNames = initialPeoplePlaceholderNames();
    const nextNames = nextPeoplePlaceholderNames(currentNames, () => 0);

    expect(nextNames).toHaveLength(MAX_VISIBLE_PEOPLE_PLACEHOLDERS);
    expect(nextNames[0]).toBe("Eric");
    expect(nextNames).toEqual(["Eric", "Alexis", "Andi", "Brent", "Carlo", "Emilie"]);
    expect(nextNames).not.toContain("Emma");
  });

  test("does not show the same name twice", () => {
    const nextNames = nextPeoplePlaceholderNames(["Fiona", "Emma", "Eric", "K'love"], () => 3);

    expect(new Set(nextNames).size).toBe(nextNames.length);
  });
});
