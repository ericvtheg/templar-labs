import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  cacheDir: "node_modules/.vite-wedding-editor-browser",
  plugins: [viteTsConfigPaths({ projects: ["./tsconfig.json"] }), react()],
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: true,
    watch: { ignored: ["**/test/results/**"] },
  },
});
