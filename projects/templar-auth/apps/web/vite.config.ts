import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devPort } from "@templar/dev-ports";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig, type PluginOption } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  server: {
    port: devPort("templar-auth-web"),
    strictPort: true,
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    alchemy() as PluginOption,
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
