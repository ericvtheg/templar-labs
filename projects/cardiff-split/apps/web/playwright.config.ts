import process from "node:process";
import { defineConfig, devices } from "@playwright/test";
import { devPort } from "@templar/dev-ports";

const port = devPort("cardiff-split-web");
const baseURL = `http://127.0.0.1:${port}`;
// biome-ignore lint/style/noProcessEnv: Playwright uses CI to adjust retries and server reuse.
const { CI } = process.env;
const isCi = Boolean(CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
