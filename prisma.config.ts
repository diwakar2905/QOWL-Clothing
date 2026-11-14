import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL is only needed for migrate/seed. `prisma generate` (run on
// npm install and in the Docker build) must work without it.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
