import type { Metadata } from "next";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { TrackForm } from "@/components/orders/track-form";

export const metadata: Metadata = { title: "Track your order", alternates: { canonical: "/orders/track" } };

export default function TrackPage() {
  return (
    <Container className="max-w-2xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Track order" }]} />
      <h1 className="display mt-6 text-5xl text-obsidian">Track your order</h1>
      <p className="mt-3 text-sm text-charcoal/80">Enter your order number and the email used at checkout.</p>
      <TrackForm />
    </Container>
  );
}
