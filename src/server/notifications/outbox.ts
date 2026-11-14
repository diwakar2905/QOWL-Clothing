import "server-only";
import { db, type Tx } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TEMPLATES, renderEmail, type TemplateKey } from "./templates";
import { getEmailProvider } from "./providers";

const MAX_ATTEMPTS = 6;

/**
 * Queue a notification. Writing inside the caller's transaction guarantees a
 * notification exists iff the business change committed. dedupeKey makes
 * enqueueing idempotent (e.g. duplicate webhooks never send two emails).
 */
export async function enqueueEmail(
  input: { template: TemplateKey; to: string; vars: Record<string, string | number | null | undefined>; dedupeKey: string },
  tx?: Tx,
) {
  const client = tx ?? db;
  await client.notificationOutbox.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: { channel: "EMAIL", template: input.template, recipient: input.to, payload: input.vars as Prisma.InputJsonValue, dedupeKey: input.dedupeKey },
    update: {},
  });
}

export async function processOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  const due = await db.$queryRaw<{ id: string }[]>`
    UPDATE "NotificationOutbox" SET "nextAttemptAt" = now() + interval '2 minutes'
    WHERE id IN (
      SELECT id FROM "NotificationOutbox"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "nextAttemptAt" LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  let sent = 0, failed = 0;
  if (!due.length) return { sent, failed };
  const provider = getEmailProvider();
  const rows = await db.notificationOutbox.findMany({ where: { id: { in: due.map((d) => d.id) } } });
  const overrides = new Map((await db.emailTemplate.findMany({ where: { key: { in: rows.map((r) => r.template) } } })).map((t) => [t.key, t]));
  for (const row of rows) {
    try {
      if (row.channel !== "EMAIL") {
        await db.notificationOutbox.update({ where: { id: row.id }, data: { status: "SKIPPED", lastError: "Channel not configured" } });
        continue;
      }
      const override = overrides.get(row.template);
      const def = DEFAULT_TEMPLATES[row.template];
      if (override && !override.isActive) {
        await db.notificationOutbox.update({ where: { id: row.id }, data: { status: "SKIPPED", lastError: "Template disabled" } });
        continue;
      }
      const subject = override?.subject ?? def?.subject;
      const body = override?.body ?? def?.body;
      if (!subject || !body) throw new Error(`Unknown template ${row.template}`);
      const msg = renderEmail(subject, body, row.payload as Record<string, string>);
      await provider.send({ to: row.recipient, ...msg });
      await db.notificationOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      await db.notificationOutbox.update({
        where: { id: row.id },
        data: { attempts, lastError: String((err as Error).message).slice(0, 500), status: final ? "FAILED" : "PENDING", nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts, 360) * 60_000) },
      });
      logger.warn("notification.send_failed", { id: row.id, template: row.template, attempts, err });
      failed++;
    }
  }
  return { sent, failed };
}
