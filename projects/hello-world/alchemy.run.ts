import { withAuthMigrations } from "@templar/auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, queue, r2Bucket, tanstackStartApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";
import { templarBindings } from "./templar-bindings.ts";

const app = await deployApp("hello-world");

const r2 = await r2Bucket("r2", {
  project: "hello-world",
});

const db = await d1Database(
  "db",
  withAuthMigrations({
    project: "hello-world",
    adopt: true,
    migrationsDirs: ["apps/web/migrations"],
  }),
);

const jobs = await queue("jobs", {
  project: "hello-world",
});

export const website = await tanstackStartApp("website", {
  project: "hello-world",
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName: "hello-world.ericventor.com",
      adopt: true,
    },
  ],
  url: false,
  bindings: {
    [templarBindings.authBaseUrl]: "https://hello-world.ericventor.com",
    [templarBindings.authSecret]: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
    [templarBindings.db]: db,
    [templarBindings.jobsQueue]: jobs,
    [templarBindings.r2]: r2,
  },
  eventSources: [
    {
      queue: jobs,
      settings: {
        batchSize: 10,
        maxConcurrency: 2,
        maxRetries: 3,
        retryDelay: 30,
      },
    },
  ],
});

console.log({
  url: "https://hello-world.ericventor.com",
});

await app.finalize();
