import { withAuthMigrations } from "@templar/auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import { withPaymentsMigrations } from "@templar/payments/deploy";
import alchemy from "alchemy";
import { templarBindings } from "./templar-bindings.ts";

const project = "swedish-fifty";
const domainName = "swedish-fifty.ericventor.com";

const app = await deployApp(project);

const db = await d1Database(
  "db",
  withPaymentsMigrations(
    withAuthMigrations({
      project,
      adopt: true,
      migrationsDirs: ["db/migrations"],
    }),
  ),
);

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName,
  url: false,
  db,
  services: {
    ai: true,
    auth: true,
  },
  templarBindings,
  bindings: {
    [templarBindings.elevenLabsApiKey]: alchemy.secret.env("ELEVENLABS_API_TOKEN"),
    [templarBindings.stripeSecretKey]: alchemy.secret.env("STRIPE_SECRET_KEY", ""),
    [templarBindings.stripeWebhookSecret]: alchemy.secret.env("STRIPE_WEBHOOK_SECRET", ""),
  },
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
