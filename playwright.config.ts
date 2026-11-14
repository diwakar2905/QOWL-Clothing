import { defineConfig, devices } from "@playwright/test";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://qowl:qowl_dev_password@localhost:5432/qowl_test";
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DB,
      APP_URL: `http://localhost:${PORT}`,
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef012345",
      PAYMENT_PROVIDER: "mock",
      MOCK_PAYMENT_SECRET: "e2e-mock-secret",
      SHIPPING_PROVIDER: "mock",
      EMAIL_PROVIDER: "console",
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: "./storage/e2e-uploads",
      CRON_SECRET: "e2e-cron-secret-0123456789",
      DISABLE_RATE_LIMIT: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
