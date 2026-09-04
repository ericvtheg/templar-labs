import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devPort } from "@templar/dev-ports";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig, type PluginOption } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  server: { port: devPort("web-daw-web"), strictPort: true },
  plugins: [
    viteTsConfigPaths(),
    mode === "studio" ? null : (alchemy() as PluginOption),
    tanstackStart(),
    viteReact(),
  ],
}));
