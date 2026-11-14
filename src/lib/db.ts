import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  return new PrismaClient({ adapter, log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"] });
}

export const db: PrismaClient = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;
export { Prisma };

/** Run fn in a transaction, or reuse the one passed in. */
export async function withTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>, opts?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number }): Promise<T> {
  if (tx) return fn(tx);
  return db.$transaction(fn, { timeout: opts?.timeout ?? 15000, maxWait: 10000, isolationLevel: opts?.isolationLevel });
}
