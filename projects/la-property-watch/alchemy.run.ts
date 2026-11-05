import { deployApp } from "@templar/deploy";
import { d1Database, queue, templarApp } from "@templar/deploy/cloudflare";
import { schedulerCrons } from "@templar/scheduler";
import { schedules } from "./apps/web/src/schedules.ts";

const domainName = "la-property-watch.breli.app";
const app = await deployApp("la-property-watch");
const db = await d1Database("db", {
  project: "la-property-watch",
  adopt: true,
  migrationsDirs: ["db/migrations"],
});
const jobs = await queue("jobs", { project: "la-property-watch" });

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName,
  url: false,
  crons: schedulerCrons(schedules),
  db,
  queue: {
    binding: jobs,
    settings: { batchSize: 1, maxConcurrency: 1, maxRetries: 2 },
  },
  bindings: { INGESTION_RUNNER: "external" },
  services: { auth: true },
});

console.log({ url: `https://${domainName}` });
await app.finalize();
