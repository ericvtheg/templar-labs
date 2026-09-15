import { restaurantVideo } from "./activity-content.ts";
import { fieldNotes, missions } from "./curriculum.ts";
import { foundationAudioTexts } from "./voice-config.ts";

// One source of truth for generation authorization AND deployment pre-generation.
export const approvedSpeechTexts = Object.freeze([
  ...new Set<string>([
    ...missions.flatMap((mission) => mission.phrases.map((phrase) => phrase.hanzi)),
    ...fieldNotes.map((phrase) => phrase.hanzi),
    ...foundationAudioTexts,
    ...missions.flatMap((mission) =>
      (mission.matches ?? []).map((card) => card.audio ?? `${card.hanzi}。`),
    ),
    "单价。",
    "每人。",
    "每份。",
    restaurantVideo.fallback,
  ]),
]);
