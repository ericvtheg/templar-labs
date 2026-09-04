import { deployApp } from "@templar/deploy";
import { Vite } from "alchemy/cloudflare";

const app = await deployApp("web-visualizer");
export const website = await Vite("website", {
  cwd: "apps/web",
  assets: { not_found_handling: "single-page-application" },
});
console.log({ url: website.url });
await app.finalize();
