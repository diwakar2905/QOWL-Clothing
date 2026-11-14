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
    // Migrations need a direct (unpooled) connection: they take an advisory
    // lock that PgBouncer-style poolers don't support. Neon's Vercel
    // integration provides DATABASE_URL_UNPOOLED; the app itself keeps using
    // the pooled DATABASE_URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
