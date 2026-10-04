import { deployApp } from "@templar/deploy";
import { Vite } from "alchemy/cloudflare";

const app = await deployApp("confer");

export const website = await Vite("website", {
  adopt: true,
  cwd: "apps/web",
  domains: ["confer.breli.app"],
  url: false,
});

console.log({ url: "https://confer.breli.app" });
await app.finalize();
