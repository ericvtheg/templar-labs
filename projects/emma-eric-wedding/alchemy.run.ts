import { deployApp } from "@templar/deploy";
import { d1Database, tanstackStartApp } from "@templar/deploy/cloudflare";
import { devPort } from "@templar/dev-ports";
import alchemy from "alchemy";

const project = "emma-eric-wedding";
const domainName = "emmaand.ericventor.com";

const app = await deployApp(project);
const authBaseUrl = app.local
  ? `http://localhost:${devPort("emma-eric-wedding-web")}`
  : `https://${domainName}`;
const authIssuer = app.local
  ? `http://localhost:${devPort("templar-auth-web")}`
  : "https://auth.breli.app";

const db = await d1Database("db", {
  project,
  adopt: true,
  migrationsDir: "./db/migrations",
});

export const website = await tanstackStartApp("website", {
  project,
  adopt: true,
  cwd: "apps/web",
  bindings: {
    AUTH_BASE_URL: authBaseUrl,
    AUTH_ISSUER: authIssuer,
    AUTH_SECRET: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
    DB: db,
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
