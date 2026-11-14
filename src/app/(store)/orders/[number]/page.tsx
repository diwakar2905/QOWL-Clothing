import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getOrderForAccess } from "@/server/services/orders";
import { orderCapabilities } from "@/server/services/order-view";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { OrderDetail } from "@/components/orders/order-detail";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function GuestOrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number } = await params;
  const { t } = await searchParams;
  const user = await getCurrentUser();
  const order = await getOrderForAccess(number, { userId: user?.id, token: t });
  if (!order) notFound();
  if (user && order.userId === user.id && !t) redirect(`/account/orders/${number}`);
  const caps = await orderCapabilities(order, !!user && order.userId === user.id);
  return (
    <Container className="max-w-5xl py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: `Order ${order.number}` }]} />
      <div className="mt-8"><OrderDetail order={order} token={t} returnEligible={caps.returnEligible} canCancel={caps.canCancel} /></div>
    </Container>
  );
}
