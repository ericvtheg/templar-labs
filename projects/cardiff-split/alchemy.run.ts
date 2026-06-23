import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const app = await deployApp("cardiff-split");

const db = await d1Database("db", {
  project: "cardiff-split",
  adopt: true,
  migrationsDir: "db/migrations",
});

export const website = await templarApp("website", {
  project: "cardiff-split",
  adopt: true,
  cwd: "apps/web",
  domainName: "cardiff-split.ericventor.com",
  url: false,
  db,
  bindings: {
    POSTHOG_HOST: alchemy.secret.env("POSTHOG_HOST"),
    POSTHOG_PROJECT_API_KEY: alchemy.secret.env("POSTHOG_PROJECT_API_KEY"),
  },
});

console.log({
  url: "https://cardiff-split.ericventor.com",
});

await app.finalize();
