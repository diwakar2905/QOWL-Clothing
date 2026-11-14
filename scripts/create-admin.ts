/**
 * Create (or promote) the first Super Admin. Production-safe; never prints the password.
 *   ADMIN_EMAIL=you@brand.in ADMIN_PASSWORD='…' ADMIN_NAME='Name' npm run admin:create
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Set ADMIN_EMAIL");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const role = await db.role.findUnique({ where: { key: "super_admin" } });
  if (!role) throw new Error("Run `npm run db:seed` first to create roles");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
  await db.user.upsert({
    where: { email },
    create: { email, name: process.env.ADMIN_NAME ?? null, passwordHash, roleId: role.id, emailVerifiedAt: new Date() },
    update: { passwordHash, roleId: role.id, status: "ACTIVE" },
  });
  console.log(`Super Admin ready: ${email}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
