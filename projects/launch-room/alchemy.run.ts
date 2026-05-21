import { withAuthMigrations } from "@templar/auth/deploy";
import { deployApp } from "@templar/deploy";
import {
  d1Database,
  kvNamespace,
  queue,
  r2Bucket,
  tanstackStartApp,
} from "@templar/deploy/cloudflare";
import alchemy from "alchemy";
import { templarBindings } from "./templar-bindings.ts";

const project = "launch-room";
const domainName = "launch-room.ericventor.com";

const app = await deployApp(project);

const r2 = await r2Bucket("r2", {
  project,
});

const db = await d1Database(
  "db",
  withAuthMigrations({
    project,
    adopt: true,
    migrationsDirs: ["db/migrations"],
  }),
);

const jobs = await queue("jobs", {
  project,
});

const cache = await kvNamespace("cache", {
  project,
});

export const website = await tanstackStartApp("website", {
  project,
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName,
      adopt: true,
    },
  ],
  url: false,
  bindings: {
    [templarBindings.authBaseUrl]: `https://${domainName}`,
    [templarBindings.authSecret]: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
    [templarBindings.cache]: cache,
    [templarBindings.db]: db,
    [templarBindings.jobsQueue]: jobs,
    [templarBindings.openRouterApiKey]: alchemy.secret.env("OPENROUTER_API_KEY"),
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
  url: `https://${domainName}`,
});

await app.finalize();
