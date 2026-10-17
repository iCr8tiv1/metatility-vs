import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.GENESIS_BROWSER_TEST_PORT ?? "4179");

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  outputDir: process.env.GENESIS_BROWSER_TEST_OUTPUT ?? "/tmp/genesis-browser-test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.GENESIS_TEST_CHROMIUM_PATH
      ? { executablePath: process.env.GENESIS_TEST_CHROMIUM_PATH }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx tests/browser/harness-server.mts",
    url: `http://127.0.0.1:${port}`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: { GENESIS_BROWSER_TEST_PORT: String(port) },
  },
});
