import { env } from "node:process";
import { deployApp } from "@templar/deploy";
import { d1Database, r2Bucket, templarApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const app = await deployApp("china");
const crewEmailsVariable = "CHINA_CREW_EMAILS";
const db = await d1Database("db", {
  project: "china",
  adopt: true,
  migrationsDirs: ["db/migrations"],
});
const speechAudio = await r2Bucket("speech-audio", { project: "china" });
export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName: "china.ericventor.com",
  url: false,
  db,
  blob: speechAudio,
  services: { auth: true },
  bindings: {
    CREW_EMAILS: alchemy.secret(env[crewEmailsVariable] ?? ""),
    ELEVENLABS_API_KEY: alchemy.secret.env("ELEVENLABS_API_TOKEN"),
    OPENROUTER_API_TOKEN: alchemy.secret.env("OPENROUTER_API_TOKEN"),
  },
});
await app.finalize();
