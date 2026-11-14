import { execSync } from "node:child_process";

/** Non-destructive: migrate + idempotent seed of the dedicated test database. */
export default function globalSetup() {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://qowl:qowl_dev_password@localhost:5432/qowl_test", SEED_FIXTURES: "true" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
