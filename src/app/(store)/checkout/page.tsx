import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/session";
import { getCartCount } from "@/server/services/cart";
import { getSettings } from "@/server/services/settings";
import { Container } from "@/components/ui/misc";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const [count, user, settings] = await Promise.all([getCartCount(), getCurrentUser(), getSettings()]);
  if (count === 0) redirect("/cart");
  const addresses = user && !user.isStaff ? await db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }) : [];
  const termsPublished = await db.page.count({ where: { slug: "terms-of-service", status: "ACTIVE" } });
  return (
    <Container className="max-w-6xl py-8 sm:py-10">
      <h1 className="display text-center text-5xl text-obsidian">Checkout</h1>
      <CheckoutForm
        user={user && !user.isStaff ? { email: user.email, name: user.name, phone: user.phone } : null}
        addresses={addresses.map((a) => ({ id: a.id, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault }))}
        cod={{ enabled: settings.payments.codEnabled, fee: settings.payments.codFeePaise }}
        onlineEnabled={settings.payments.onlineEnabled}
        termsPublished={termsPublished > 0}
        returnsSummary={settings.returns.policySummary}
      />
    </Container>
  );
}
