import { existsSync } from "node:fs";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig, type PluginOption } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const usesCloudflare = existsSync(".alchemy/local/wrangler.jsonc");
const cloudflarePlugin = usesCloudflare ? [alchemy() as PluginOption] : [];

export default defineConfig({
  // Cloudflare owns built-in module resolution during deployment. Only the
  // standalone smoke-test build needs these imports left external.
  ...(usesCloudflare
    ? {}
    : {
        build: { rollupOptions: { external: ["cloudflare:workers"] } },
        ssr: { external: ["cloudflare:workers"] },
      }),
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    ...cloudflarePlugin,
    tanstackStart(),
    viteReact(),
  ],
});
