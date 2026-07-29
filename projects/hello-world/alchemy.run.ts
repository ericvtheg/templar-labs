import { deployApp } from "@templar/deploy";
import { d1Database, queue, r2Bucket, templarApp } from "@templar/deploy/cloudflare";
import { schedulerCrons } from "@templar/scheduler";
import { withUsersMigrations } from "@templar/users/deploy";
import { schedules } from "./apps/web/src/schedules.ts";

const domainName = "hello-world.breli.app";
const app = await deployApp("hello-world");

const r2 = await r2Bucket("r2", {
  project: "hello-world",
});

const db = await d1Database(
  "db",
  withUsersMigrations({
    project: "hello-world",
    adopt: true,
    migrationsDirs: ["db/migrations"],
  }),
);

const jobs = await queue("jobs", {
  project: "hello-world",
});

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName,
  url: false,
  crons: schedulerCrons(schedules),
  db,
  blob: r2,
  queue: jobs,
  services: {
    auth: true,
  },
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
