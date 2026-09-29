import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];

export default defineConfig({
  testDir: "./test/browser",
  outputDir: "./test/results",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5197",
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      ...(executablePath === undefined ? {} : { executablePath }),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "vite --config test/browser/vite.config.ts",
    url: "http://127.0.0.1:5197/test/browser/editor-harness.html",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
