import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getOrderForAccess } from "@/server/services/orders";
import { orderCapabilities } from "@/server/services/order-view";
import { OrderDetail } from "@/components/orders/order-detail";
import { ReviewPrompts } from "@/components/account/review-prompts";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

export default async function AccountOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const { number } = await params;
  const order = await getOrderForAccess(number, { userId: user.id });
  if (!order) notFound();
  const caps = await orderCapabilities(order, true);
  const { db } = await import("@/lib/db");
  const reviewed = new Set((await db.review.findMany({ where: { orderItemId: { in: order.items.map((i) => i.id) } }, select: { orderItemId: true } })).map((r) => r.orderItemId));
  return (
    <div className="space-y-10">
      <OrderDetail order={order} returnEligible={caps.returnEligible} canCancel={caps.canCancel} />
      {order.fulfillmentStatus === "DELIVERED" && (
        <ReviewPrompts items={order.items.filter((i) => i.productId && !reviewed.has(i.id)).map((i) => ({ id: i.id, name: i.productName, variant: `${i.colorName} / ${i.size}` }))} />
      )}
    </div>
  );
}
