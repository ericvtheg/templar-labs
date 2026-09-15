import type { Mission } from "./curriculum.ts";
import type { Mastery } from "./types.ts";
export type EncounterFormat = "cards" | "ears" | "voice";
export type SessionStep = { id: string } & (
  | { kind: "intro" | "foundations" | "signs" | "prices" | "coach" | "video" | "payoff" }
  | { kind: "phrase"; task: number; format: EncounterFormat }
);
export function sessionPlan(mission: Mission, mastery: Mastery[], replay: boolean): SessionStep[] {
  const learned = new Set(
    mastery
      .filter((item) => item.mission_id === mission.id && item.level > 0)
      .map((item) => item.task),
  );
  const steps: SessionStep[] = [{ id: "intro", kind: "intro" }];
  if (mission.id === "basics" && (!learned.has(0) || replay)) {
    steps.push({ id: "foundations", kind: "foundations" });
  }
  const formats: EncounterFormat[] = ["cards", "ears", "voice"];
  mission.phrases.forEach((_, task) => {
    if (replay || !learned.has(task)) {
      steps.push({
        id: `phrase-${task}`,
        kind: "phrase",
        task,
        format: formats[task % formats.length] ?? "cards",
      });
    }
  });
  if (replay || !learned.has(mission.phrases.length)) {
    steps.push({ id: "signs", kind: "signs" });
  }
  if (mission.id === "market") {
    steps.push({ id: "prices", kind: "prices" });
  }
  steps.push({ id: "coach", kind: "coach" });
  // A restaurant video belongs in the food chapter, not on every lesson page.
  if (mission.id === "feast") {
    steps.push({ id: "video", kind: "video" });
  }
  steps.push({ id: "payoff", kind: "payoff" });
  return steps;
}
