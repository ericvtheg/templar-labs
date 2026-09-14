import { env } from "node:process";
import { deployApp } from "@templar/deploy";
import { d1Database, templarApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const app = await deployApp("china");
const crewEmailsVariable = "CHINA_CREW_EMAILS";
const db = await d1Database("db", {
  project: "china",
  adopt: true,
  migrationsDirs: ["db/migrations"],
});
export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName: "china.ericventor.com",
  url: false,
  db,
  services: { auth: true },
  bindings: { CREW_EMAILS: alchemy.secret(env[crewEmailsVariable] ?? "") },
});
await app.finalize();
