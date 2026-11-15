import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getOrderForAccess } from "@/server/services/orders";
import { orderCapabilities } from "@/server/services/order-view";
import { Container } from "@/components/ui/misc";
import { Sparkle } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { OrderDetail } from "@/components/orders/order-detail";
import { PaymentPoller } from "@/components/orders/payment-poller";
import { CartSync } from "@/components/checkout/cart-sync";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

/** Refresh-safe: this page only reads the order; it never creates or charges anything. */
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ order?: string; t?: string }> }) {
  const { order: number, t } = await searchParams;
  if (!number) notFound();
  const user = await getCurrentUser();
  const order = await getOrderForAccess(number.slice(0, 30), { userId: user?.id, token: t });
  if (!order) notFound();
  const caps = await orderCapabilities(order, !!user && order.userId === user.id);
  const pending = order.status === "PENDING_PAYMENT";
  const failed = order.status === "PAYMENT_FAILED" || order.status === "EXPIRED";
  return (
    <Container className="max-w-5xl py-10 sm:py-14">
      <CartSync />
      <div className="mb-10 text-center">
        <Sparkle className="mx-auto h-5 w-5 text-forest" />
        <h1 className="display mt-4 text-5xl text-obsidian sm:text-6xl">{pending ? "Confirming payment" : failed ? "Payment not completed" : "Thank you"}</h1>
        <p className="mt-3 text-charcoal/80">
          {pending && "We're waiting for confirmation from the payment provider. This usually takes a few seconds."}
          {failed && "Your payment wasn't completed, so this order hasn't been placed. You can return to your bag and try again."}
          {!pending && !failed && <>Your order <strong>{order.number}</strong> is confirmed. A confirmation email is on its way to {order.email}.</>}
        </p>
        {pending && <PaymentPoller number={order.number} token={t ?? null} />}
        {failed && <ButtonLink href="/cart" className="mt-6">Return to bag</ButtonLink>}
        {!user && !pending && !failed && (
          <p className="mt-4 text-sm text-charcoal/75">Keep this link to view your order, or <Link href={`/register?email=${encodeURIComponent(order.email)}`} className="text-forest underline">create an account</Link> to track orders and request returns.</p>
        )}
      </div>
      <OrderDetail order={order} token={t} returnEligible={caps.returnEligible} canCancel={caps.canCancel && !pending} />
    </Container>
  );
}
