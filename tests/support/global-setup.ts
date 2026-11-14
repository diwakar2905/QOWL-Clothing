import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./env";

/**
 * Non-destructive: applies migrations and the idempotent seed to the test
 * database. Tests create their own isolated records (unique products, emails,
 * phones), so the suite never needs to wipe data.
 */
export default function setup() {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "test" as const, SEED_FIXTURES: "true" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
