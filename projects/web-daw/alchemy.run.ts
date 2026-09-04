import { deployApp } from "@templar/deploy";
import { templarApp } from "@templar/deploy/cloudflare";

const app = await deployApp("web-daw");
export const website = await templarApp("website", {
  adopt: true,
  cwd: "apps/web",
  domainName: "web-daw.ericventor.com",
  url: false,
});
console.log({ url: "https://web-daw.ericventor.com" });
await app.finalize();
