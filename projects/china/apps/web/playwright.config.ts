import { defineConfig, devices } from "@playwright/test";
import { devPort } from "@templar/dev-ports";

const port = devPort("china-web");
export default defineConfig({
  testDir: "test/e2e",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
