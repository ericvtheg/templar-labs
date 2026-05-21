import { defineTemplarBindings } from "@templar/deploy/bindings";

export const templarBindings = defineTemplarBindings({
  authBaseUrl: "AUTH_BASE_URL",
  authSecret: "AUTH_SECRET",
  cache: "CACHE",
  db: "DB",
  jobsQueue: "JOBS",
  openRouterApiKey: "OPENROUTER_API_KEY",
  r2: "R2",
});
