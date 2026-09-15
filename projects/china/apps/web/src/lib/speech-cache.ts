import {
  mandarinModelId,
  mandarinVoiceSettings,
  type SpeechSpeed,
  speechSpeeds,
} from "./voice-config.ts";

export async function speechCacheKey(
  text: string,
  speed: SpeechSpeed,
  voiceId: string,
): Promise<string> {
  const identity = JSON.stringify({
    version: 1,
    text,
    speed,
    rate: speechSpeeds[speed],
    voiceId,
    model: mandarinModelId,
    stability: mandarinVoiceSettings.stability,
    similarityBoost: mandarinVoiceSettings.similarityBoost,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return `mandarin/${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}.mp3`;
}
