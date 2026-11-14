import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth/session";
import { listWishlist } from "@/server/services/wishlist";
import { Breadcrumbs, Container, SectionHeading } from "@/components/ui/misc";
import { WishlistGrid } from "@/components/store/wishlist-grid";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default async function WishlistPage() {
  const user = await getCurrentUser();
  const initial = user && !user.isStaff ? await listWishlist(user.id) : null;
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wishlist" }]} />
      <SectionHeading as="h1" title="Wishlist" className="mb-10 mt-6" />
      <WishlistGrid initial={initial} signedIn={!!user} />
    </Container>
  );
}
