import { defineTemplarBindings } from "@templar/deploy/bindings";

export const templarBindings = defineTemplarBindings({
  authBaseUrl: "AUTH_BASE_URL",
  authSecret: "AUTH_SECRET",
  db: "DB",
  jobsQueue: "JOBS",
  r2: "R2",
});
