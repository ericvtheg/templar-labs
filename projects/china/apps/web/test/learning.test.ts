import { describe, expect, it } from "vitest";
import { isCrew, sameOrigin } from "../src/lib/access.ts";
import { crew, missions } from "../src/lib/curriculum.ts";
import { grade, nextReview, normalizeRecall } from "../src/lib/learning.ts";

describe("private crew access", () => {
  it("fails closed, requires verified emails, and matches whole addresses", () => {
    expect(isCrew("gavin@example.com", true, "")).toBe(false);
    expect(isCrew("gavin@example.com", false, "gavin@example.com")).toBe(false);
    expect(isCrew("gavin@example.com.evil.test", true, "gavin@example.com")).toBe(false);
    expect(isCrew("gavin@example.com", true, "*@example.com")).toBe(false);
    expect(
      isCrew("GAVIN@example.com", true, " timmy@example.com; GAVIN@EXAMPLE.COM\nrolo@example.com "),
    ).toBe(true);
  });
  it("requires exact Origin on mutations", () => {
    expect(
      sameOrigin(
        new Request("https://china.ericventor.com/api/trip/answer", {
          headers: { origin: "https://china.ericventor.com" },
        }),
      ),
    ).toBe(true);
    for (const origin of ["null", "https://evil.test", "https://china.ericventor.com.evil.test"]) {
      expect(
        sameOrigin(
          new Request("https://china.ericventor.com/api/trip/answer", { headers: { origin } }),
        ),
      ).toBe(false);
    }
    expect(sameOrigin(new Request("https://china.ericventor.com/api/trip/answer"))).toBe(false);
  });
});
describe("zero-to-travel curriculum", () => {
  it("starts with hello, contains all 18 supplied names, and respects Kendall’s pronouns", () => {
    expect(missions[0]?.id).toBe("basics");
    expect(missions[0]?.phrases[0]?.hanzi).toBe("你好。");
    expect(crew).toHaveLength(18);
    for (const name of crew) {
      expect(missions.some((mission) => mission.story.includes(name))).toBe(true);
    }
    expect(missions.find((mission) => mission.id === "feast")?.story).toContain("Kendall says she");
  });
  it("has unique IDs, valid sign answers, and a gradeable Chinese and pinyin answer for every phrase", () => {
    expect(new Set(missions.map((mission) => mission.id)).size).toBe(missions.length);
    for (const mission of missions) {
      expect(mission.options[mission.answer]).toBeTruthy();
      expect(grade(mission.id, mission.phrases.length, String(mission.answer))).toBe(true);
      for (const [index, phrase] of mission.phrases.entries()) {
        expect(phrase.english).toBeTruthy();
        expect(phrase.tip).toBeTruthy();
        expect(grade(mission.id, index, phrase.hanzi)).toBe(true);
        expect(grade(mission.id, index, phrase.pinyin)).toBe(true);
        expect(grade(mission.id, index, normalizeRecall(phrase.pinyin))).toBe(true);
        expect(grade(mission.id, index, "absolutely not the answer")).toBe(false);
      }
    }
  });
  it("does not mistake invalid task IDs for answers", () => {
    for (const task of [-1, 0.5, Number.NaN, 999]) {
      expect(grade("basics", task, "你好")).toBe(false);
    }
    expect(grade("unknown", 0, "你好")).toBe(false);
    expect(grade("basics", 0, " NI HAO!! ")).toBe(true);
    expect(normalizeRecall("nǚ")).toBe(normalizeRecall("nü"));
    expect(normalizeRecall("nǚ")).toBe("nv");
    expect(normalizeRecall("nǚ")).not.toBe(normalizeRecall("nu"));
  });
  it("spreads successful reviews and brings mistakes back sooner", () => {
    const now = 1_000_000;
    expect(nextReview(0, true, now)).toEqual({ level: 1, due: now + 86_400_000 });
    expect(nextReview(1, true, now)).toEqual({ level: 2, due: now + 3 * 86_400_000 });
    expect(nextReview(5, true, now)).toEqual({ level: 5, due: now + 30 * 86_400_000 });
    expect(nextReview(4, false, now)).toEqual({ level: 0, due: now + 300_000 });
  });
});
