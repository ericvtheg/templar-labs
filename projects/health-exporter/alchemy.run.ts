import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const app = await deployApp("health-exporter");
const db = await d1Database("db", {
  project: "health-exporter",
  adopt: true,
  migrationsDir: "db/migrations",
});

export const api = await templarApp("api", {
  adopt: true,
  cwd: "apps/web",
  url: true,
  db,
  bindings: {
    HEALTH_EXPORTER_SECRET: alchemy.secret.env("HEALTH_EXPORTER_SECRET"),
  },
});

console.log({ url: api.url });
await app.finalize();
