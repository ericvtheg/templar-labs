import { describe, expect, it } from "vitest";
import { missions } from "../src/lib/curriculum.ts";
import { sessionPlan } from "../src/lib/session-plan.ts";

describe("guided chapter itinerary", () => {
  it("starts absolute beginners with foundations before recall and saves hype for the end", () => {
    const mission = missions[0];
    if (!mission) {
      throw new Error("Missing foundations");
    }
    const plan = sessionPlan(mission, [], false);
    expect(plan.slice(0, 3).map((step) => step.kind)).toEqual(["intro", "foundations", "phrase"]);
    expect(plan.at(-1)?.kind).toBe("payoff");
    expect(plan.filter((step) => step.kind === "phrase").map((step) => step.task)).toEqual(
      mission.phrases.map((_, index) => index),
    );
    expect(new Set(plan.map((step) => step.id)).size).toBe(plan.length);
  });
  it("resumes after saved practice without changing phrase indices or rebuilding an existing itinerary", () => {
    const mission = missions[0];
    if (!mission) {
      throw new Error("Missing foundations");
    }
    const mastery = [{ mission_id: mission.id, task: 0, level: 1, due: 0 }];
    const plan = sessionPlan(mission, mastery, false);
    expect(plan.some((step) => step.kind === "foundations")).toBe(false);
    expect(plan[1]).toMatchObject({ kind: "phrase", task: 1, format: "ears" });
    mastery.push({ mission_id: mission.id, task: 1, level: 1, due: 0 });
    expect(plan[1]).toMatchObject({ task: 1 });
    expect(sessionPlan(mission, mastery, false)[1]).toMatchObject({ task: 2 });
  });
  it("allows explicit replay without treating old mastery as missing", () => {
    const mission = missions[0];
    if (!mission) {
      throw new Error("Missing foundations");
    }
    const mastery = mission.phrases.map((_, task) => ({
      mission_id: mission.id,
      task,
      level: 1,
      due: 0,
    }));
    expect(sessionPlan(mission, mastery, false)[1]?.kind).toBe("signs");
    expect(sessionPlan(mission, mastery, true)[1]?.kind).toBe("foundations");
  });
  it("places video only in the food chapter and receipt math only in the market chapter", () => {
    for (const mission of missions) {
      const plan = sessionPlan(mission, [], false);
      expect(plan.some((step) => step.kind === "video")).toBe(mission.id === "feast");
      expect(plan.some((step) => step.kind === "prices")).toBe(mission.id === "market");
      expect(plan.findIndex((step) => step.kind === "signs")).toBeLessThan(
        plan.findIndex((step) => step.kind === "coach"),
      );
    }
  });
});
