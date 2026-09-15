import type { Mission } from "./curriculum.ts";
export type Mastery = { mission_id: string; task: number; level: number; due: number };
export type Activity = {
  user_id: string;
  name: string;
  mission_id: string;
  created_at: number;
  cheers: number;
  cheered: number;
};
export type BoardMember = { id: string; name: string; completed: number };
export type TripData = {
  user: { id: string; name: string };
  groom: string;
  crew: string[];
  crewRoles?: Record<string, string>;
  missions: Mission[];
  fieldNotes: { hanzi: string; pinyin: string; english: string }[];
  mastery: Mastery[];
  completed: string[];
  board: BoardMember[];
  activity: Activity[];
};
export type AnswerResult = { correct: boolean; completed: boolean };
