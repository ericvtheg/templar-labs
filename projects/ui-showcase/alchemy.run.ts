import { deployApp } from "@templar/deploy";
import { tanstackStartApp } from "@templar/deploy/cloudflare";

const app = await deployApp("ui-showcase");

export const website = await tanstackStartApp("website", {
  project: "ui-showcase",
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName: "ui-showcase.ericventor.com",
      adopt: true,
    },
  ],
  url: false,
});

console.log({
  url: "https://ui-showcase.ericventor.com",
});

await app.finalize();
