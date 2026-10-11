import { devPort } from "@templar/dev-ports";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: devPort("weddingv2-web"), strictPort: true },
});
