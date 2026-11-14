import "server-only";
import { db, type Tx } from "@/lib/db";
import { AppError, conflict } from "@/lib/errors";
import type { InventoryMovementType } from "@/generated/prisma/enums";

/**
 * Inventory model (per variant):
 *   onHand    physical sellable units (includes reserved)
 *   reserved  held by pending checkouts; available = onHand - reserved
 *   committed paid units awaiting shipment (already removed from onHand)
 *   damaged / returnedPending  not sellable
 * Every mutation is a single conditional UPDATE so concurrent checkouts can
 * never oversell; CHECK constraints are the last line of defence.
 */

export type StockLine = { variantId: string; quantity: number };

export type Shortage = { variantId: string; requested: number; available: number };

function merge(lines: StockLine[]): StockLine[] {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.variantId, (m.get(l.variantId) ?? 0) + l.quantity);
  // Stable lock ordering prevents deadlocks between concurrent transactions.
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([variantId, quantity]) => ({ variantId, quantity }));
}

export async function availableFor(variantIds: string[], tx?: Tx): Promise<Map<string, number>> {
  const rows = await (tx ?? db).inventoryLevel.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, onHand: true, reserved: true } });
  const map = new Map<string, number>(variantIds.map((id) => [id, 0]));
  for (const r of rows) map.set(r.variantId, Math.max(0, r.onHand - r.reserved));
  return map;
}

/** Reserve stock for a pending order. Throws OUT_OF_STOCK with shortages. */
export async function reserve(tx: Tx, orderId: string, lines: StockLine[], ttlMinutes: number) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const shortages: Shortage[] = [];
  for (const l of merge(lines)) {
    const n = await tx.$executeRaw`
      UPDATE "InventoryLevel" SET "reserved" = "reserved" + ${l.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} AND "onHand" - "reserved" >= ${l.quantity}`;
    if (n === 0) {
      const avail = (await availableFor([l.variantId], tx)).get(l.variantId) ?? 0;
      shortages.push({ variantId: l.variantId, requested: l.quantity, available: avail });
      continue;
    }
    await tx.inventoryReservation.create({ data: { orderId, variantId: l.variantId, quantity: l.quantity, expiresAt } });
  }
  if (shortages.length) throw conflict("OUT_OF_STOCK", "Some items in your bag are no longer available in the quantity requested.", { shortages });
}

/** Release ACTIVE reservations of an order (payment failed/expired/cancelled). Idempotent. */
export async function releaseReservations(tx: Tx, orderId: string, to: "RELEASED" | "EXPIRED" = "RELEASED") {
  const active = await tx.$queryRaw<{ id: string; variantId: string; quantity: number }[]>`
    UPDATE "InventoryReservation" SET status = ${to}::"ReservationStatus", "updatedAt" = now()
    WHERE "orderId" = ${orderId} AND status = 'ACTIVE'
    RETURNING id, "variantId", quantity`;
  for (const r of merge(active.map((a) => ({ variantId: a.variantId, quantity: a.quantity })))) {
    await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = GREATEST("reserved" - ${r.quantity}, 0), "updatedAt" = now() WHERE "variantId" = ${r.variantId}`;
  }
  return active.length;
}

/** Units currently committed (sold, unshipped) for an order, per variant, from the ledger. */
export async function committedByOrder(tx: Tx, orderId: string): Promise<Map<string, number>> {
  const rows = await tx.inventoryMovement.groupBy({ by: ["variantId"], where: { orderId, type: { in: ["SALE", "SHIPMENT", "CANCELLATION_RELEASE"] } }, _sum: { committedDelta: true } });
  return new Map(rows.map((r) => [r.variantId, r._sum.committedDelta ?? 0]));
}

/**
 * Convert an order's stock into committed (sold) units. Uses the active
 * reservation when present; if it expired, tries to take available stock.
 * Returns shortages instead of throwing so a captured payment is never lost.
 */
export async function commitOrderStock(tx: Tx, orderId: string, lines: StockLine[]): Promise<{ ok: boolean; shortages: Shortage[] }> {
  const active = await tx.$queryRaw<{ variantId: string; quantity: number }[]>`
    UPDATE "InventoryReservation" SET status = 'COMMITTED', "updatedAt" = now()
    WHERE "orderId" = ${orderId} AND status = 'ACTIVE'
    RETURNING "variantId", quantity`;
  const reservedBy = new Map<string, number>();
  for (const a of active) reservedBy.set(a.variantId, (reservedBy.get(a.variantId) ?? 0) + a.quantity);
  const shortages: Shortage[] = [];
  const already = await committedByOrder(tx, orderId);
  for (const full of merge(lines)) {
    // Skip units already committed by an earlier (partial) attempt.
    const l = { variantId: full.variantId, quantity: full.quantity - Math.max(0, already.get(full.variantId) ?? 0) };
    if (l.quantity <= 0) continue;
    const fromReservation = Math.min(reservedBy.get(l.variantId) ?? 0, l.quantity);
    const extra = l.quantity - fromReservation;
    const n = await tx.$executeRaw`
      UPDATE "InventoryLevel"
      SET "reserved" = "reserved" - ${fromReservation},
          "onHand" = "onHand" - ${l.quantity},
          "committed" = "committed" + ${l.quantity},
          "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} AND "reserved" >= ${fromReservation} AND ("onHand" - "reserved") >= ${extra}`;
    if (n === 0) {
      // Release whatever reservation we held for this line; it can't be fulfilled.
      if (fromReservation > 0) await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = GREATEST("reserved" - ${fromReservation}, 0) WHERE "variantId" = ${l.variantId}`;
      const avail = (await availableFor([l.variantId], tx)).get(l.variantId) ?? 0;
      shortages.push({ variantId: l.variantId, requested: l.quantity, available: avail });
      continue;
    }
    await logMovement(tx, { variantId: l.variantId, type: "SALE", onHandDelta: -l.quantity, committedDelta: l.quantity, orderId });
  }
  return { ok: shortages.length === 0, shortages };
}

/** Committed → shipped (only what this order actually has committed). */
export async function shipOrderStock(tx: Tx, orderId: string) {
  const lines = [...(await committedByOrder(tx, orderId)).entries()].filter(([, q]) => q > 0).map(([variantId, quantity]) => ({ variantId, quantity }));
  for (const l of merge(lines)) {
    await tx.$executeRaw`UPDATE "InventoryLevel" SET "committed" = GREATEST("committed" - ${l.quantity}, 0), "updatedAt" = now() WHERE "variantId" = ${l.variantId}`;
    await logMovement(tx, { variantId: l.variantId, type: "SHIPMENT", committedDelta: -l.quantity, orderId });
  }
}

/** Order cancelled before shipment: this order's committed units go back on hand. */
export async function restoreCommittedStock(tx: Tx, orderId: string) {
  const lines = [...(await committedByOrder(tx, orderId)).entries()].filter(([, q]) => q > 0).map(([variantId, quantity]) => ({ variantId, quantity }));
  for (const l of merge(lines)) {
    const n = await tx.$executeRaw`
      UPDATE "InventoryLevel" SET "committed" = "committed" - ${l.quantity}, "onHand" = "onHand" + ${l.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId} AND "committed" >= ${l.quantity}`;
    if (n > 0) await logMovement(tx, { variantId: l.variantId, type: "CANCELLATION_RELEASE", onHandDelta: l.quantity, committedDelta: -l.quantity, orderId });
  }
}

/** Returned parcel received: units wait in quarantine until inspected. */
export async function receiveReturnedUnits(tx: Tx, returnId: string, lines: StockLine[], orderId: string) {
  for (const l of merge(lines)) {
    await ensureLevel(tx, l.variantId);
    await tx.$executeRaw`UPDATE "InventoryLevel" SET "returnedPending" = "returnedPending" + ${l.quantity}, "updatedAt" = now() WHERE "variantId" = ${l.variantId}`;
    await logMovement(tx, { variantId: l.variantId, type: "RETURN_RECEIVED", returnedDelta: l.quantity, returnId, orderId });
  }
}

/** Inspection outcome: never restocks automatically. */
export async function resolveInspectedUnits(tx: Tx, args: { variantId: string; restock: number; damaged: number; returnId: string; actorId: string; note?: string }) {
  const total = args.restock + args.damaged;
  if (total === 0) return;
  const n = await tx.$executeRaw`
    UPDATE "InventoryLevel"
    SET "returnedPending" = "returnedPending" - ${total}, "onHand" = "onHand" + ${args.restock}, "damaged" = "damaged" + ${args.damaged}, "updatedAt" = now()
    WHERE "variantId" = ${args.variantId} AND "returnedPending" >= ${total}`;
  if (n === 0) throw new AppError("INVENTORY_STATE", "Returned units for this item have not been received yet.", 409);
  if (args.restock) await logMovement(tx, { variantId: args.variantId, type: "RETURN_RESTOCK", onHandDelta: args.restock, returnedDelta: -args.restock, returnId: args.returnId, actorId: args.actorId, note: args.note });
  if (args.damaged) await logMovement(tx, { variantId: args.variantId, type: "DAMAGED", damagedDelta: args.damaged, returnedDelta: -args.damaged, returnId: args.returnId, actorId: args.actorId, note: args.note });
}

async function ensureLevel(tx: Tx, variantId: string) {
  await tx.$executeRaw`INSERT INTO "InventoryLevel" ("variantId", "updatedAt") VALUES (${variantId}, now()) ON CONFLICT ("variantId") DO NOTHING`;
}

/**
 * Admin stock operations.
 *  - RESTOCK/IMPORT/ADJUSTMENT: add delta (may be negative) to onHand
 *  - CORRECTION: set onHand to an absolute counted value
 *  - DAMAGED: move units from onHand to damaged
 * onHand can never drop below reserved units.
 */
export async function adjustStock(
  args: { variantId: string; type: Extract<InventoryMovementType, "RESTOCK" | "IMPORT" | "ADJUSTMENT" | "CORRECTION" | "DAMAGED">; quantity: number; reason: string; note?: string; actorId: string; lowStockThreshold?: number },
  txIn?: Tx,
) {
  const run = async (tx: Tx) => {
    await ensureLevel(tx, args.variantId);
    const [level] = await tx.$queryRaw<{ onHand: number; reserved: number }[]>`SELECT "onHand", "reserved" FROM "InventoryLevel" WHERE "variantId" = ${args.variantId} FOR UPDATE`;
    if (!level) throw new AppError("NOT_FOUND", "Variant not found", 404);
    let onHandDelta = 0, damagedDelta = 0;
    if (args.type === "CORRECTION") {
      if (!Number.isInteger(args.quantity) || args.quantity < 0) throw new AppError("INVALID_QUANTITY", "Counted stock must be a whole number ≥ 0");
      onHandDelta = args.quantity - level.onHand;
    } else if (args.type === "DAMAGED") {
      if (!Number.isInteger(args.quantity) || args.quantity <= 0) throw new AppError("INVALID_QUANTITY", "Quantity must be a positive whole number");
      onHandDelta = -args.quantity;
      damagedDelta = args.quantity;
    } else {
      if (!Number.isInteger(args.quantity) || args.quantity === 0) throw new AppError("INVALID_QUANTITY", "Quantity must be a non-zero whole number");
      if (args.type !== "ADJUSTMENT" && args.quantity < 0) throw new AppError("INVALID_QUANTITY", "Restocks must be positive; use an adjustment to remove stock");
      onHandDelta = args.quantity;
    }
    const nextOnHand = level.onHand + onHandDelta;
    if (nextOnHand < 0) throw new AppError("NEGATIVE_STOCK", "Stock cannot go below zero.", 409);
    if (nextOnHand < level.reserved) throw new AppError("RESERVED_STOCK", `${level.reserved} unit(s) are reserved by pending checkouts; stock cannot go below that.`, 409);
    await tx.inventoryLevel.update({
      where: { variantId: args.variantId },
      data: { onHand: nextOnHand, damaged: { increment: damagedDelta }, ...(args.lowStockThreshold != null ? { lowStockThreshold: args.lowStockThreshold } : {}) },
    });
    if (onHandDelta !== 0 || damagedDelta !== 0) {
      await logMovement(tx, { variantId: args.variantId, type: args.type, onHandDelta, damagedDelta, reason: args.reason, note: args.note, actorId: args.actorId });
    }
    return { onHand: nextOnHand };
  };
  return txIn ? run(txIn) : db.$transaction(run);
}

export async function logMovement(
  tx: Tx,
  m: { variantId: string; type: InventoryMovementType; onHandDelta?: number; committedDelta?: number; damagedDelta?: number; returnedDelta?: number; orderId?: string; returnId?: string; actorId?: string; reason?: string; note?: string },
) {
  const lvl = await tx.inventoryLevel.findUnique({ where: { variantId: m.variantId }, select: { onHand: true } });
  await tx.inventoryMovement.create({
    data: {
      variantId: m.variantId,
      type: m.type,
      onHandDelta: m.onHandDelta ?? 0,
      committedDelta: m.committedDelta ?? 0,
      damagedDelta: m.damagedDelta ?? 0,
      returnedDelta: m.returnedDelta ?? 0,
      onHandAfter: lvl?.onHand ?? 0,
      orderId: m.orderId,
      returnId: m.returnId,
      actorId: m.actorId,
      reason: m.reason,
      note: m.note,
    },
  });
}
