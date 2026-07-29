import { withApiAuthMigrations } from "@templar/api-auth/deploy";
import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import { withUsersMigrations } from "@templar/users/deploy";

const project = "your-shopper";
const domainName = "your-shopper.breli.app";
const app = await deployApp(project);

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
  adopt: true,
  cwd: "apps/web",
  domainName,
  url: false,
  db,
  services: {
    auth: true,
  },
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
