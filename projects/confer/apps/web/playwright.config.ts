import { env } from "node:process";
import { defineConfig, devices } from "@playwright/test";

const { CONFER_TEST_URL, CI } = env;
const baseURL = CONFER_TEST_URL ?? "http://127.0.0.1:5189";

export default defineConfig({
  testDir: "./test/e2e",
  outputDir: "./test/.results",
  fullyParallel: false,
  workers: 1,
  timeout: 40_000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  ...(CONFER_TEST_URL
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !CI,
        },
      }),
});
