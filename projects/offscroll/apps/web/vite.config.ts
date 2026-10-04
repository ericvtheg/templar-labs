import { existsSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devPort } from "@templar/dev-ports";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
  server: { port: devPort("offscroll-web"), strictPort: true },
  plugins: [
    tailwindcss(),
    alchemy(
      existsSync(".alchemy/local/wrangler.jsonc")
        ? {}
        : {
            configPath: "wrangler.jsonc",
            persistState: { path: ".wrangler/state" },
          },
    ) as PluginOption,
    tanstackStart(),
    viteReact(),
  ],
});
