import { deployApp } from "@templar/deploy";
import { templarApp } from "@templar/deploy/cloudflare";

const app = await deployApp("ui-showcase");

export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName: "ui-showcase.ericventor.com",
  url: false,
});

console.log({
  url: "https://ui-showcase.ericventor.com",
});

await app.finalize();
