import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { Breadcrumbs, ConceptBadge, Container, EmptyState, SectionHeading } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const count = await db.lookbookImage.count({ where: { isActive: true } });
  return { title: "Lookbook", description: "The Unwritten Journal: a visual exploration of QOWL Drop 001.", alternates: { canonical: "/lookbook" }, ...(count ? {} : { robots: { index: false, follow: true } }) };
}

export default async function LookbookPage() {
  const images = await db.lookbookImage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { product: { select: { slug: true, name: true, status: true } } } });
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Lookbook" }]} />
      <SectionHeading as="h1" eyebrow="Lookbook" title="The Unwritten Journal" subtitle="A visual exploration of Drop 001." className="mb-10 mt-6" />
      {images.length === 0 ? (
        <EmptyState title="Coming soon" body="The lookbook is being shot." />
      ) : (
        <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4">
          {images.map((im, i) => (
            <li key={im.id} className="break-inside-avoid">
              <figure className="relative overflow-hidden bg-cream">
                <Image src={im.imageUrl} alt={im.alt} width={800} height={1000} priority={i < 2} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="h-auto w-full" />
                {im.isConcept && <ConceptBadge className="absolute left-2 top-2" />}
                {(im.caption || (im.product && im.product.status === "ACTIVE")) && (
                  <figcaption className="flex items-center justify-between gap-3 bg-ivory px-1 pt-2 text-sm">
                    <span className="font-serif italic text-charcoal/85">{im.caption}</span>
                    {im.product?.status === "ACTIVE" && <Link href={`/products/${im.product.slug}`} className="label link-underline shrink-0 text-forest">Shop {im.product.name}</Link>}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
