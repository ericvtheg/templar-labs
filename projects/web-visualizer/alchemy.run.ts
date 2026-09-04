import { deployApp } from "@templar/deploy";
import { Vite } from "alchemy/cloudflare";

const domainName = "web-visualizer.ericventor.com";
const app = await deployApp("web-visualizer");
export const website = await Vite("website", {
  cwd: "apps/web",
  domains: [domainName],
  url: false,
  assets: { not_found_handling: "single-page-application" },
});
console.log({ url: `https://${domainName}` });
await app.finalize();
