import { withApiAuthMigrations } from "@templar/api-auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import { withUsersMigrations } from "@templar/users/deploy";

const project = "your-shopper";
const domainName = "your-shopper.breli.app";
const app = await deployApp(project);
const authIssuer = "https://auth.breli.app";

const db = await d1Database(
  "db",
  withUsersMigrations(
    withApiAuthMigrations({
      project,
      adopt: true,
      migrationsDirs: [],
    }),
  ),
);

export const website = await templarApp("website", {
  project,
  adopt: true,
  cwd: "apps/web",
  domainName,
  url: false,
  db,
  bindings: {
    AUTH_ISSUER: authIssuer,
  },
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
