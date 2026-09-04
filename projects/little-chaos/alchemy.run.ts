import { deployApp } from "@templar/deploy";
import { Vite } from "alchemy/cloudflare";

const app = await deployApp("little-chaos");

export const website = await Vite("website", {
  adopt: true,
  cwd: "apps/web",
  domains: ["little-chaos.ericventor.com"],
  url: false,
});

console.log({ url: "https://little-chaos.ericventor.com" });
await app.finalize();
