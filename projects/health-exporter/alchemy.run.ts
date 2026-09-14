import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";

const app = await deployApp("health-exporter");
const db = await d1Database("db", {
  project: "health-exporter",
  adopt: true,
  migrationsDir: "db/migrations",
});

export const api = await templarApp("api", {
  project: "health-exporter",
  adopt: true,
  cwd: "apps/web",
  url: true,
  db,
});

console.log({ url: api.url });
await app.finalize();
