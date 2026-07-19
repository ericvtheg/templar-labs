import { deployApp } from "@templar/deploy";
import { tanstackStartApp } from "@templar/deploy/cloudflare";

const project = "emma-eric-wedding";
const domainName = "emma-eric.ericventor.com";

const app = await deployApp(project);

export const website = await tanstackStartApp("website", {
  project,
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName,
      adopt: true,
    },
  ],
  url: false,
});

console.log({
  url: `https://${domainName}`,
});

await app.finalize();
