import { defineTemplarBindings } from "@templar/deploy/bindings";

export const templarBindings = defineTemplarBindings({
  authBaseUrl: "AUTH_BASE_URL",
  authSecret: "AUTH_SECRET",
  cache: "CACHE",
  db: "DB",
  elevenLabsApiKey: "ELEVENLABS_API_KEY",
  elevenLabsVoiceId: "ELEVENLABS_VOICE_ID",
  jobsQueue: "JOBS",
  openRouterApiToken: "OPENROUTER_API_TOKEN",
  r2: "R2",
  stripeSecretKey: "STRIPE_SECRET_KEY",
  stripeWebhookSecret: "STRIPE_WEBHOOK_SECRET",
});
