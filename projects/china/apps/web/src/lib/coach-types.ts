export type CoachTarget = {
  id: string;
  kind: "phrase" | "emergency";
  hanzi: string;
  pinyin: string;
  english: string;
  tip: string;
};
export type CoachScene = {
  id: string;
  scene: string;
  prompt: string;
  target: CoachTarget;
  source: "ai" | "fallback" | "curated";
};
export type CoachReply = {
  correct: boolean;
  feedback: string;
  source: "ai" | "fallback" | "curated";
  target: CoachTarget;
};
