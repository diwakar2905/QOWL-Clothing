import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission } from "@/server/auth/session";
import { getOrderForAccess } from "@/server/services/orders";
import { buildInvoice, ensureInvoiceNumber } from "@/server/services/invoice";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/orders/print-button";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

type Addr = { fullName: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; phone: string };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number } = await params;
  const { t } = await searchParams;
  const user = await getCurrentUser();
  let orderId: string | null = null;
  if (hasPermission(user, "orders.read")) orderId = (await db.order.findUnique({ where: { number }, select: { id: true } }))?.id ?? null;
  else orderId = (await getOrderForAccess(number, { userId: user?.id, token: t }))?.id ?? null;
  if (!orderId) notFound();
  const invNo = await ensureInvoiceNumber(orderId);
  if (!invNo) notFound();
  const inv = await buildInvoice(orderId);
  const { order, seller } = inv;
  const a = order.shippingAddress as Addr;
  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-obsidian print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-stone">Invoice for order {order.number}</p>
        <PrintButton />
      </div>
      {!inv.configured && (
        <p className="mb-6 border border-warning bg-warning/10 p-3 text-warning">Seller GST registration details are not configured. This document is an order summary and is not a valid tax invoice.</p>
      )}
      <header className="flex justify-between border-b border-obsidian pb-4">
        <div>
          <p className="font-serif text-3xl tracking-[0.2em]">QOWL</p>
          <p className="mt-1 font-medium">{seller.legalName || seller.brandName}</p>
          {seller.registeredAddress && <p className="max-w-xs whitespace-pre-line text-charcoal/80">{seller.registeredAddress}</p>}
          {seller.gstin && <p>GSTIN: {seller.gstin}</p>}
          {seller.sellerState && <p>State: {seller.sellerState}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{inv.configured ? "Tax Invoice" : "Order Summary"}</p>
          <p>Invoice no. {invNo}</p>
          <p>Date {formatDate(order.confirmedAt ?? order.placedAt)}</p>
          <p>Order {order.number}</p>
          <p>Payment: {order.paymentMethod === "COD" ? "Cash on Delivery" : "Prepaid"}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-6 py-4">
        <div>
          <p className="font-semibold">Bill / ship to</p>
          <p>{a.fullName}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}<br />{order.email}</p>
        </div>
        <div className="text-right"><p className="font-semibold">Place of supply</p><p>{a.state}</p></div>
      </section>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-obsidian text-left">
            <th className="py-2 pr-2">Item</th><th className="pr-2">HSN</th><th className="pr-2 text-right">Qty</th><th className="pr-2 text-right">Unit price</th><th className="pr-2 text-right">Discount</th><th className="pr-2 text-right">Taxable value</th>
            {inv.intra ? <><th className="pr-2 text-right">CGST</th><th className="pr-2 text-right">SGST</th></> : <th className="pr-2 text-right">IGST</th>}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id} className="border-b border-soft align-top">
              <td className="py-2 pr-2">{l.productName} — {l.colorName} / {l.size}<br /><span className="text-stone">SKU {l.sku}</span></td>
              <td className="pr-2">{l.hsnCode}</td>
              <td className="pr-2 text-right">{l.quantity}</td>
              <td className="pr-2 text-right">{formatINR(l.unitPrice)}</td>
              <td className="pr-2 text-right">{l.lineDiscount ? formatINR(l.lineDiscount) : "—"}</td>
              <td className="pr-2 text-right">{formatINR(l.taxable)}</td>
              {inv.intra ? <><td className="pr-2 text-right">{formatINR(l.cgst)}<br /><span className="text-stone">{l.taxRateBps / 200}%</span></td><td className="pr-2 text-right">{formatINR(l.sgst)}<br /><span className="text-stone">{l.taxRateBps / 200}%</span></td></> : <td className="pr-2 text-right">{formatINR(l.igst)}<br /><span className="text-stone">{l.taxRateBps / 100}%</span></td>}
              <td className="text-right">{formatINR(l.lineTotal)}</td>
            </tr>
          ))}
          {inv.charges > 0 && (
            <tr className="border-b border-soft">
              <td className="py-2 pr-2" colSpan={5}>Shipping{order.codFee ? " & COD charges" : ""}</td>
              <td className="pr-2 text-right">{formatINR(inv.charges - inv.chargesTax)}</td>
              {inv.intra ? <><td className="pr-2 text-right">{formatINR(Math.floor(inv.chargesTax / 2))}</td><td className="pr-2 text-right">{formatINR(inv.chargesTax - Math.floor(inv.chargesTax / 2))}</td></> : <td className="pr-2 text-right">{formatINR(inv.chargesTax)}</td>}
              <td className="text-right">{formatINR(inv.charges)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-72 space-y-1">
        <div className="flex justify-between"><span>Total tax</span><span>{formatINR(order.taxTotal)}</span></div>
        <div className="flex justify-between border-t border-obsidian pt-1 text-base font-semibold"><span>Grand total</span><span>{formatINR(order.grandTotal)}</span></div>
        {order.refundedTotal > 0 && <div className="flex justify-between text-stone"><span>Refunded</span><span>−{formatINR(order.refundedTotal)}</span></div>}
      </div>
      <p className="mt-8 text-[11px] text-stone">All prices are inclusive of GST. {inv.footer}</p>
    </main>
  );
}
