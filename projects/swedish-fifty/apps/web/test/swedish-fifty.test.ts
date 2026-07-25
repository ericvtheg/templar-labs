import { describe, expect, test } from "vitest";
import {
  buildCalendar,
  dateFromIso,
  fallbackMission,
  missionDayForDate,
  missionIsComplete,
  phaseForDay,
  prepWindowDays,
  scenarioForDay,
} from "../src/lib/swedish-fifty.ts";

describe("Swedish Fifty learning arc", () => {
  test("maps prep dates into the bounded 50-day window", () => {
    expect(missionDayForDate(dateFromIso("2026-06-03"))).toBe(1);
    expect(missionDayForDate(dateFromIso("2026-06-12"))).toBe(10);
    expect(missionDayForDate(dateFromIso("2026-07-22"))).toBe(50);
    expect(missionDayForDate(dateFromIso("2026-08-01"))).toBe(50);
  });

  test("keeps the phase arc aligned with the spec", () => {
    expect(phaseForDay(1)).toBe("Survival Swedish");
    expect(phaseForDay(11)).toBe("Family Swedish");
    expect(phaseForDay(21)).toBe("Stockholm Swedish");
    expect(phaseForDay(31)).toBe("Conversation Expansion");
    expect(phaseForDay(41)).toBe("Simulation Mode");
  });

  test("builds a visible 50-day calendar with generated state", () => {
    const calendar = buildCalendar(dateFromIso("2026-06-03"), new Set(["2026-06-03"]));

    expect(calendar).toHaveLength(prepWindowDays);
    expect(calendar[0]).toMatchObject({
      dayNumber: 1,
      isToday: true,
      isGenerated: true,
    });
  });

  test("fallback missions remain practical and scenario based", () => {
    const mission = fallbackMission(21);

    expect(mission.phase).toBe("Stockholm Swedish");
    expect(mission.scenarioKey).toBe(scenarioForDay(21));
    expect(mission.prompts.length).toBeGreaterThanOrEqual(3);
    expect(mission.dialogue.length).toBeGreaterThanOrEqual(2);
  });

  test("only completes a mission after every prompt has an attempt", () => {
    expect(missionIsComplete(["one", "two", "three"], [])).toBe(false);
    expect(missionIsComplete(["one", "two", "three"], ["one", "two", "one"])).toBe(false);
    expect(missionIsComplete(["one", "two", "three"], ["three", "one", "two"])).toBe(true);
  });
});
