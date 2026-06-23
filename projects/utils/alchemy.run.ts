import { deployApp } from "@templar/deploy";
import { tanstackStartApp } from "@templar/deploy/cloudflare";

const app = await deployApp("utils");

export const website = await tanstackStartApp("website", {
  project: "utils",
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName: "utils.ericventor.com",
      adopt: true,
    },
  ],
  url: false,
});

console.log({
  url: "https://utils.ericventor.com",
});

await app.finalize();
