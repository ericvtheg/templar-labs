import { env } from "node:process";
import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";
import { EmailSender, RateLimit } from "alchemy/cloudflare";

const project = "emma-eric-wedding";
const domainName = "emmaand.ericventor.com";

const app = await deployApp(project);

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

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName,
  db,
  services: {
    auth: true,
  },
  bindings: {
    EMAIL: email,
    // biome-ignore lint/complexity/useLiteralKeys: Node's env is an index signature under strict TypeScript.
    WEDDING_EDITOR_EMAILS: alchemy.secret(env["WEDDING_EDITOR_EMAILS"] ?? ""),
    RSVP_LOOKUP_RATE_LIMIT: rsvpLookupRateLimit,
  },
  url: false,
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
