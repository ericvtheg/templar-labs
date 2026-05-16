import { tanstackStartApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const app = await alchemy("ui-showcase");

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
