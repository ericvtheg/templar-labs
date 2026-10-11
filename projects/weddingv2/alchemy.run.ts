import { deployApp } from "@templar/deploy";
import { Vite } from "alchemy/cloudflare";

const domainName = "weddingv2.ericventor.com";
const app = await deployApp("weddingv2");

export const website = await Vite("website", {
  cwd: "apps/web",
  domains: [domainName],
  url: false,
  // Every page has its own URL, so a deep link must fall back to the app shell.
  assets: { not_found_handling: "single-page-application" },
});

console.log({ url: `https://${domainName}` });
await app.finalize();
