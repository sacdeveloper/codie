import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests. By default they start a local stack (PostgreSQL + GoTrue + PostgREST + storage shim,
 * see tests/e2e/stack) and the app on :3100. Set E2E_BASE_URL to run against a deployed environment
 * that has been seeded with the same users (see README).
 */
const remote = Boolean(process.env.E2E_BASE_URL);
// Use a pre-installed browser directory when present (e.g. cloud dev containers).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: remote
    ? undefined
    : [
        { command: "npx tsx tests/e2e/stack/start-stack.ts", url: "http://127.0.0.1:54321/health", timeout: 180_000, reuseExistingServer: true, stdout: "pipe" },
        { command: "node scripts/e2e-app.mjs", url: "http://localhost:3100/api/health", timeout: 600_000, reuseExistingServer: true, stdout: "pipe" },
      ],
});
