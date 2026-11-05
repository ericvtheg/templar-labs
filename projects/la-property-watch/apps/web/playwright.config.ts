import { defineConfig, devices } from "@playwright/test";
import { devPort } from "@templar/dev-ports";

const port = devPort("la-property-watch-web");

export default defineConfig({
  testDir: "./test/e2e",
  outputDir: "./test/.results",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    {
      name: "desktop",
      testMatch: /app\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "pnpm e2e:built",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
