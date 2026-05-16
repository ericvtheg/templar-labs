import { r2Bucket, tanstackStartApp } from "@templar/deploy/cloudflare";
import alchemy from "alchemy";

const app = await alchemy("hello-world");

const r2 = await r2Bucket("r2", {
  project: "hello-world",
});

export const website = await tanstackStartApp("website", {
  project: "hello-world",
  adopt: true,
  cwd: "apps/web",
  domains: [
    {
      domainName: "hello-world.ericventor.com",
      adopt: true,
    },
  ],
  url: false,
  bindings: {
    R2: r2,
  },
});

console.log({
  url: "https://hello-world.ericventor.com",
});

await app.finalize();
