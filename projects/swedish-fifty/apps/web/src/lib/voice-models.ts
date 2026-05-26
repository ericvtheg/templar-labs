export type VoiceModelRoute = "quality" | "fast" | "balanced";

export const voiceModelRoutes = {
  quality: "eleven_multilingual_v2",
  fast: "eleven_flash_v2_5",
  balanced: "eleven_turbo_v2_5",
} as const satisfies Record<VoiceModelRoute, string>;
