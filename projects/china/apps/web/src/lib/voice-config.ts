// Shared ElevenLabs account; voice choice lives in code, not a per-app environment variable.
// This included voice works on the current plan. Change this constant to a Mandarin library
// voice only after the shared account's plan permits library voices through the API.
export const defaultMandarinVoiceId = "JBFqnCBsd6RMkjVDRZzb";
export const mandarinModelId = "eleven_multilingual_v2";
export const mandarinVoiceSettings = { stability: 0.7, similarityBoost: 0.75 } as const;
export const speechSpeeds = { normal: 1, slow: 0.75 } as const;
export type SpeechSpeed = keyof typeof speechSpeeds;
export const foundationAudioTexts = [
  "你。",
  "好。",
  "你好。",
  "妈。",
  "麻。",
  "马。",
  "骂。",
] as const;
