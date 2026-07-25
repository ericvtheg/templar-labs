import { withAuthMigrations } from "@templar/auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, tanstackStartApp } from "@templar/deploy/cloudflare";
import { devPort } from "@templar/dev-ports";
import alchemy from "alchemy";

const project = "templar-auth";
const domainName = "auth.ericventor.com";

const app = await deployApp(project);
const authOrigin = app.local
  ? `http://localhost:${devPort("templar-auth-web")}`
  : `https://${domainName}`;

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
    AUTH_BASE_URL: authOrigin,
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
