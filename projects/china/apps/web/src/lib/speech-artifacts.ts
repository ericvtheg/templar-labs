import { speechCacheKey } from "./speech-cache.ts";
import { approvedSpeechTexts } from "./speech-catalog.ts";
import {
  defaultMandarinVoiceId,
  mandarinModelId,
  mandarinVoiceSettings,
  type SpeechSpeed,
  speechSpeeds,
} from "./voice-config.ts";

export type AudioClip = { key: string; text: string; speed: SpeechSpeed };
export async function audioPlan(): Promise<AudioClip[]> {
  return Promise.all(
    approvedSpeechTexts.flatMap((text) =>
      (Object.keys(speechSpeeds) as SpeechSpeed[]).map(async (speed) => ({
        text,
        speed,
        key: await speechCacheKey(text, speed, defaultMandarinVoiceId),
      })),
    ),
  );
}
export type HistoryItem = {
  history_item_id?: string;
  text?: string;
  voice_id?: string;
  model_id?: string;
  settings?: {
    speed?: number;
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
};
export function matchesHistory(item: HistoryItem, clip: AudioClip): boolean {
  return (
    Boolean(item.history_item_id) &&
    item.text === clip.text &&
    item.voice_id === defaultMandarinVoiceId &&
    item.model_id === mandarinModelId &&
    item.settings?.speed === speechSpeeds[clip.speed] &&
    item.settings.stability === mandarinVoiceSettings.stability &&
    item.settings.similarity_boost === mandarinVoiceSettings.similarityBoost &&
    (item.settings.style ?? 0) === 0 &&
    (item.settings.use_speaker_boost ?? true)
  );
}
