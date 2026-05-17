import { deployApp } from "@templar/deploy";
import { d1Database, r2Bucket, tanstackStartApp } from "@templar/deploy/cloudflare";

const app = await deployApp("hello-world");

const r2 = await r2Bucket("r2", {
  project: "hello-world",
});

const db = await d1Database("db", {
  project: "hello-world",
  adopt: true,
  migrationsDir: "apps/web/migrations",
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
    DB: db,
    R2: r2,
  },
});

console.log({
  url: "https://hello-world.ericventor.com",
});

await app.finalize();
