import { missions } from "./curriculum.ts";

// This checks text recall, not pronunciation. Tone quality is never inferred from typing.
export function normalizeRecall(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ü", "v")
    .normalize("NFD")
    .replace(/u\u0308/g, "v")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
export function grade(missionId: string, task: number, answer: string): boolean {
  const mission = missions.find((item) => item.id === missionId);
  if (!mission || !Number.isInteger(task) || task < 0 || task > mission.phrases.length) {
    return false;
  }
  if (task === mission.phrases.length) {
    return answer === String(mission.answer);
  }
  const phrase = mission.phrases[task];
  return (
    phrase !== undefined &&
    [phrase.hanzi, phrase.pinyin].some(
      (value) => normalizeRecall(value) === normalizeRecall(answer),
    )
  );
}
export const reviewIntervals = [1, 3, 7, 14, 30];
export function nextReview(level: number, correct: boolean, now: number) {
  const nextLevel = correct ? Math.min(level + 1, reviewIntervals.length) : 0;
  const days = reviewIntervals[Math.max(0, nextLevel - 1)] ?? 1;
  return { level: nextLevel, due: now + (correct ? days * 86_400_000 : 5 * 60_000) };
}
