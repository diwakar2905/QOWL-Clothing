import "server-only";
import { db } from "@/lib/db";
import { inclusiveTax } from "@/domain/pricing";
import { getSettings } from "./settings";
import { nextNumber } from "./orders";

/** Indian financial year label (Apr–Mar), e.g. 2026-27, computed in IST. */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Assigns a sequential invoice number the first time an invoice is issued for a paid order. */
export async function ensureInvoiceNumber(orderId: string): Promise<string | null> {
  const settings = await getSettings();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.invoiceNumber) return o.invoiceNumber;
    if (!["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "COD_COLLECTED"].includes(o.paymentStatus)) return null;
    const fy = financialYear(o.confirmedAt ?? o.placedAt);
    const n = await nextNumber(tx, `invoice:${fy}`, `${settings.tax.invoicePrefix}/${fy}/`, 5);
    await tx.order.update({ where: { id: orderId }, data: { invoiceNumber: n } });
    return n;
  });
}

export async function buildInvoice(orderId: string) {
  const [order, settings] = await Promise.all([db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }), getSettings()]);
  const tb = order.taxBreakdown as { mode?: string; sellerState?: string | null; shipToState?: string; gstin?: string | null; shippingTax?: number };
  const intra = tb.mode === "INTRA_STATE";
  const lines = order.items.map((i) => {
    const taxable = i.lineTotal - i.taxAmount;
    const half = Math.floor(i.taxAmount / 2);
    return { ...i, taxable, cgst: intra ? half : 0, sgst: intra ? i.taxAmount - half : 0, igst: intra ? 0 : i.taxAmount };
  });
  const charges = order.shippingTotal + order.codFee;
  const chargesTax = tb.shippingTax ?? inclusiveTax(charges, Math.max(0, ...order.items.map((i) => i.taxRateBps)));
  return { order, lines, intra, charges, chargesTax, seller: settings.store, footer: settings.tax.invoiceFooter, configured: !!(settings.store.gstin && settings.store.legalName && settings.store.sellerState) };
}
