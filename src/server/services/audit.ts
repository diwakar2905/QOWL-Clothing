import "server-only";
import { db, type Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function audit(
  entry: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; summary?: string; before?: unknown; after?: unknown; ipAddress?: string },
  tx?: Tx,
) {
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary?.slice(0, 500),
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: entry.ipAddress,
    },
  });
}
