import { withAuthMigrations } from "@templar/auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, queue, r2Bucket, templarApp } from "@templar/deploy/cloudflare";

const app = await deployApp("hello-world");

const r2 = await r2Bucket("r2", {
  project: "hello-world",
});

const db = await d1Database(
  "db",
  withAuthMigrations({
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
  db,
  blob: r2,
  queue: jobs,
});

console.log({
  url: "https://hello-world.ericventor.com",
});

await app.finalize();
