import { withAuthMigrations } from "@templar/auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, tanstackStartApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const project = "emma-eric-wedding";
const domainName = "emmaand.ericventor.com";

const app = await deployApp(project);

const db = await d1Database(
  "db",
  withAuthMigrations({
    project,
    adopt: true,
    migrationsDirs: [],
  }),
);

export const website = await tanstackStartApp("website", {
  project,
  adopt: true,
  cwd: "apps/web",
  bindings: {
    AUTH_BASE_URL: `https://${domainName}`,
    AUTH_SECRET: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
    DB: db,
    GOOGLE_CLIENT_ID: alchemy.secret.env("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: alchemy.secret.env("GOOGLE_CLIENT_SECRET"),
  },
  domains: [
    {
      domainName,
      adopt: true,
    },
  ],
  url: false,
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
