// Test environment: separate database, mock providers, no network.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://qowl:qowl_dev_password@localhost:5432/qowl_test";
export function applyTestEnv() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3100",
    DATABASE_URL: TEST_DATABASE_URL,
    SESSION_SECRET: "test-session-secret-0123456789abcdef0123",
    PAYMENT_PROVIDER: "mock",
    MOCK_PAYMENT_SECRET: "test-mock-secret",
    SHIPPING_PROVIDER: "mock",
    EMAIL_PROVIDER: "console",
    STORAGE_DRIVER: "local",
    CRON_SECRET: "test-cron-secret-0123456789",
    DISABLE_RATE_LIMIT: "true",
  });
}
