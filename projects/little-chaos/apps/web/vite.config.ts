import { devPort } from "@templar/dev-ports";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: devPort("little-chaos-web"), strictPort: true },
  build: { target: "es2022" },
});
