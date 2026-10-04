import { devPort } from "@templar/dev-ports";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: devPort("confer-web"), strictPort: true },
  preview: { port: devPort("confer-web"), strictPort: true },
  plugins: [
    react(),
    {
      name: "confer-production-csp",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'",
          },
          injectTo: "head-prepend",
        },
      ],
    },
  ],
  build: { target: "es2022" },
});
