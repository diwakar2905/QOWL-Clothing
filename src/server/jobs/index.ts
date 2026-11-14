import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { expireStaleOrders } from "@/server/services/orders";
import { reconcilePendingPayments } from "@/server/services/payments";
import { syncTracking } from "@/server/services/fulfillment";
import { processOutbox } from "@/server/notifications/outbox";
import { cleanupBuckets } from "@/server/services/rate-limit";

/**
 * All periodic work, safe to run concurrently and repeatedly (idempotent).
 * Trigger every 1–5 minutes via the platform scheduler hitting
 * POST /api/cron/jobs (Bearer CRON_SECRET) or `npm run jobs:run`.
 */
export async function runJobs() {
  const started = Date.now();
  const result: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      result[name] = await fn();
    } catch (e) {
      result[name] = { error: (e as Error).message };
      logger.error(`job.${name}.failed`, { e });
    }
  };
  // Reconcile before expiring so a late capture is applied, not released.
  await step("reconcilePayments", () => reconcilePendingPayments());
  await step("expireOrders", () => expireStaleOrders());
  await step("outbox", () => processOutbox(50));
  await step("tracking", () => syncTracking());
  await step("cleanup", async () => {
    await cleanupBuckets();
    const s = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const t = await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
    const i = await db.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const c = await db.cart.deleteMany({ where: { userId: null, updatedAt: { lt: new Date(Date.now() - 60 * 86400_000) } } });
    return { sessions: s.count, tokens: t.count, idempotency: i.count, carts: c.count };
  });
  result.ms = Date.now() - started;
  logger.info("jobs.run", result);
  return result;
}
