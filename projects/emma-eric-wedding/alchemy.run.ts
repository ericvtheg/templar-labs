import { deployApp } from "@templar/deploy";
import { d1Database, tanstackStartApp } from "@templar/deploy/cloudflare";
import { devPort } from "@templar/dev-ports";
import alchemy from "alchemy";
import { EmailSender, RateLimit } from "alchemy/cloudflare";

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
const email = EmailSender({
  allowedSenderAddresses: ["rsvp@ericventor.com"],
});
const rsvpLookupRateLimit = RateLimit({
  namespace_id: 92527,
  simple: {
    limit: 10,
    period: 60,
  },
});

export const website = await tanstackStartApp("website", {
  project,
  adopt: true,
  cwd: "apps/web",
  bindings: {
    APP_ENV: app.local ? "local" : "prod",
    AUTH_BASE_URL: authBaseUrl,
    AUTH_ISSUER: authIssuer,
    AUTH_SECRET: alchemy.secret.env("TEMPLAR_AUTH_SECRET"),
    DB: db,
    EMAIL: email,
    RSVP_LOOKUP_RATE_LIMIT: rsvpLookupRateLimit,
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
