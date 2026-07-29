import { deployApp } from "@templar/deploy";
import { templarApp } from "@templar/deploy/cloudflare";

const app = await deployApp("utils");

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName: "utils.ericventor.com",
  url: false,
});

console.log({
  url: "https://utils.ericventor.com",
});

await app.finalize();
