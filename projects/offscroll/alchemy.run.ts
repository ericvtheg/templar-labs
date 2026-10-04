import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import { withUsersMigrations } from "@templar/users/deploy";

const domainName = "offscroll.breli.app";
const app = await deployApp("offscroll");
const db = await d1Database(
  "db",
  withUsersMigrations({
    project: "offscroll",
    adopt: true,
    migrationsDirs: ["db/migrations"],
  }),
);

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName,
  url: false,
  db,
  services: { auth: true },
});

console.log({ url: `https://${domainName}` });
await app.finalize();
