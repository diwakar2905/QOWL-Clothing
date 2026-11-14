import "server-only";
import { db } from "@/lib/db";
import { tooMany } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by Postgres so it works across multiple
 * app instances without extra infrastructure. Returns remaining attempts.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  if (process.env.DISABLE_RATE_LIMIT === "true" && process.env.NODE_ENV !== "production") return { allowed: true, count: 0 };
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= limit, count };
}

export async function enforce(key: string, limit: number, windowSeconds: number, message?: string) {
  const r = await hit(key, limit, windowSeconds);
  if (!r.allowed) throw tooMany(message);
}

export async function cleanupBuckets() {
  await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 3600_000) } } });
}
