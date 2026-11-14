import type { Metadata } from "next";
import { Breadcrumbs, Container, SectionHeading } from "@/components/ui/misc";
import { CartPageClient } from "@/components/store/cart-page";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default function CartPage() {
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag" }]} />
      <SectionHeading as="h1" title="Your Bag" className="mb-10 mt-6" />
      <CartPageClient />
    </Container>
  );
}
