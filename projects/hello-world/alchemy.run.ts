import { deployApp } from "@templar/deploy";
import { d1Database, queue, r2Bucket, templarApp } from "@templar/deploy/cloudflare";
import { devPort } from "@templar/dev-ports";
import { schedulerCrons } from "@templar/scheduler";
import { withUsersMigrations } from "@templar/users/deploy";
import { schedules } from "./apps/web/src/schedules.ts";

const app = await deployApp("hello-world");
const authIssuer = app.local
  ? `http://localhost:${devPort("templar-auth-web")}`
  : "https://auth.breli.app";

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
  project: "hello-world",
  adopt: true,
  cwd: "apps/web",
  domainName: "hello-world.ericventor.com",
  url: false,
  crons: schedulerCrons(schedules),
  db,
  blob: r2,
  queue: jobs,
  bindings: {
    AUTH_ISSUER: authIssuer,
  },
});

console.log({
  url: "https://hello-world.ericventor.com",
});

await app.finalize();
