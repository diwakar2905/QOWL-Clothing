import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getProductDetail, relatedProducts, collectionSiblings } from "@/server/services/catalog";
import { getSettings } from "@/server/services/settings";
import { getCurrentUser, hasPermission } from "@/server/auth/session";
import { Breadcrumbs, ConceptBadge, Container, JsonLd } from "@/components/ui/misc";
import { Sparkle, Star } from "@/components/ui/icons";
import { ProductView, type PdpData } from "@/components/product/product-view";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { ProductCard } from "@/components/store/product-card";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { absoluteUrl, metaDescription, productLd, productTitle, storeFacts } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string; color?: string; size?: string }> };

async function load(slug: string, preview: boolean) {
  if (preview) {
    const u = await getCurrentUser();
    if (hasPermission(u, "catalog.read")) return getProductDetail(slug, { preview: true });
  }
  return getProductDetail(slug);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const preview = (await searchParams).preview === "1";
  const p = await load(slug, preview);
  // The page itself returns the 404; here we only make sure a missing product is never indexable.
  if (!p) return { title: "Product not found", robots: { index: false, follow: false } };
  const img = p.images[0];
  const title = productTitle(p);
  const description = p.seoDescription || metaDescription(p.description);
  return {
    title,
    description,
    // Colour/size query params preselect options but always canonicalise to the product.
    alternates: { canonical: `/products/${p.slug}` },
    ...(preview ? { robots: { index: false, follow: false } } : {}),
    openGraph: { type: "website", title: `${title} | QOWL`, description, url: absoluteUrl(`/products/${p.slug}`), images: img ? [{ url: img.url, alt: img.alt }] : undefined },
    twitter: { card: "summary_large_image", title: `${title} | QOWL`, description, images: img ? [img.url] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const preview = sp.preview === "1";
  // Resolve the product before anything else so notFound() runs before the
  // response starts streaming: crawlers get a real 404, not a soft 404.
  const p = await load(slug, preview);
  if (!p) notFound();
  const settings = await getSettings();
  const primaryCollection = p.visibleCollections.find((c) => c.slug === "drop-001") ?? p.visibleCollections[0];
  const [related, siblingsAll] = await Promise.all([relatedProducts(p.id, p.categoryId, 3), primaryCollection ? collectionSiblings(primaryCollection.slug, p.id, 8) : Promise.resolve([])]);
  const siblings = siblingsAll.filter((s) => !related.some((r) => r.id === s.id)).slice(0, 4);

  const details: PdpData["details"] = [];
  if (p.fabric || p.gsm) details.push({ icon: "fabric", title: [p.gsm && `${p.gsm.replace(/^([\d–-]+)/, "$1 GSM")}`, p.fabric?.split("(")[0]?.trim()].filter(Boolean).join(" · ") || "Fabric", body: p.fabric ?? "" });
  if (p.fit) details.push({ icon: "fit", title: `${p.fit} fit`, body: p.garmentType });
  if (p.careInstructions) details.push({ icon: "care", title: "Care", body: p.careInstructions });

  const data: PdpData = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    styleCode: p.styleCode,
    subtitle: p.subtitle,
    description: p.description,
    collectionLabel: primaryCollection ? primaryCollection.title.replace(" / ", " — ") : p.category.name,
    mrp: p.mrp,
    price: p.effectivePrice,
    colors: p.colors.map((c) => ({ id: c.id, name: c.name, hex: c.hex })),
    images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, isConcept: i.isConcept, width: i.width, height: i.height, colorId: i.colorId })),
    variants: p.variants.map((v) => ({ id: v.id, colorId: v.colorId, size: v.size, price: v.price, available: v.available })),
    details,
    detailsApproved: p.detailsApproved,
    sizeGuide: p.sizeGuide?.isApproved ? p.sizeGuide : null,
    lowStockThreshold: 3,
  };

  // Story pairs the most specific artwork detail with the most specific fabric close-up.
  const storyImages = [p.images.filter((i) => i.kind === "DETAIL").at(-1), p.images.filter((i) => i.kind === "FABRIC").at(-1)].filter((x): x is NonNullable<typeof x> => !!x);
  const ld = productLd(p, storeFacts(settings));
  // ?color=<slug>&size=<size> (used by structured data and the Merchant feed) preselects the variant.
  const initialColorId = p.colors.find((c) => c.slug === sp.color)?.id ?? null;
  const initialSize = sp.size && p.variants.some((v) => v.size === sp.size && (!initialColorId || v.colorId === initialColorId)) ? sp.size : null;

  const disclosures: [string, string | null | undefined][] = [
    ["Style code", p.styleCode],
    ["Generic name", p.garmentType],
    ["Net quantity", p.netQuantity],
    ["Country of origin", p.countryOfOrigin],
    ["Manufactured by", p.manufacturerInfo],
    ["Marketed by", p.marketerInfo],
    ["MRP", `${formatINR(p.mrp)} (inclusive of all taxes)`],
    ["Customer care", [settings.store.supportEmail, settings.store.supportPhone].filter(Boolean).join(" · ") || null],
  ];

  return (
    <>
      {p.status !== "ACTIVE" || (p.publishAt && p.publishAt > new Date()) ? (
        <div className="bg-warning px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-ivory">Preview — this product is {p.status.toLowerCase()} and not visible to customers</div>
      ) : null}
      <JsonLd data={ld} />
      <Container className="pb-28 pt-5 lg:pb-16">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, ...(primaryCollection ? [{ label: primaryCollection.title.split(" / ")[0]!, href: `/collections/${primaryCollection.slug}` }] : [{ label: p.category.name, href: `/category/${p.category.slug}` }]), { label: p.name }]} />
        <div className="mt-5">
          <ProductView p={data} initialColorId={initialColorId} initialSize={initialSize} conceptNotice={settings.launch.conceptImageNotice} codEnabled={settings.payments.codEnabled} returnsSummary={settings.returns.policySummary || null} />
        </div>

        {p.story && (
          <section className="mt-16 grid items-center gap-6 lg:grid-cols-[1.1fr_0.75fr_1fr] lg:gap-6" aria-labelledby="story-heading">
            {storyImages.map((im, i) => (
              <div key={im.id} className={i === 0 ? "relative aspect-[16/9] overflow-hidden rounded-[3px] bg-cream" : "relative aspect-[4/3] overflow-hidden rounded-[3px] bg-cream lg:aspect-[5/4]"}>
                <Image src={im.url} alt={im.alt} fill sizes="(max-width: 1024px) 100vw, 35vw" className="object-cover" />
                {im.isConcept && <ConceptBadge className="absolute bottom-2 left-2" text="Concept" />}
              </div>
            ))}
            <div className="lg:pl-6">
              <div className="flex items-start gap-4">
                <h2 id="story-heading" className="display text-4xl text-obsidian sm:text-5xl">A different kind of dark</h2>
                <Sparkle className="mt-1 h-6 w-6 shrink-0 text-forest" />
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-charcoal/85">{p.story}</p>
            </div>
          </section>
        )}

        <section className="mt-16 grid gap-8 border-t hairline pt-10 lg:grid-cols-2" aria-label="Product information">
          <div>
            <h2 className="label-wide mb-4">Product information</h2>
            <dl className="divide-y hairline text-sm">
              {disclosures.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[150px_1fr] gap-4 py-2.5"><dt className="text-stone">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="label-wide mb-4">Reviews</h2>
            {p.rating ? (
              <>
                <p className="flex items-center gap-2 text-sm"><Star className="h-4 w-4 fill-forest text-forest" /> {p.rating.average} out of 5 · {p.rating.count} review{p.rating.count === 1 ? "" : "s"}</p>
                <ul className="mt-4 space-y-5">
                  {p.reviews.map((r) => (
                    <li key={r.id} className="border-b hairline pb-4 text-sm">
                      <p className="flex items-center gap-2" aria-label={`Rated ${r.rating} out of 5`}>
                        {Array.from({ length: 5 }, (_, i) => <Star key={i} aria-hidden className={i < r.rating ? "h-3.5 w-3.5 fill-forest text-forest" : "h-3.5 w-3.5 text-silver"} />)}
                        {r.isVerifiedPurchase && <span className="text-[11px] font-medium uppercase tracking-wider text-success">Verified purchase</span>}
                      </p>
                      {r.title && <p className="mt-2 font-medium">{r.title}</p>}
                      <p className="mt-1 text-charcoal/85">{r.body}</p>
                      <p className="mt-1 text-xs text-stone">{r.user.name?.split(" ")[0] ?? "Customer"} · {formatDate(r.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-charcoal/75">No reviews yet. Customers can review this piece from their order history after delivery.</p>
            )}
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-20" aria-labelledby="also-like">
            <div className="flex items-center justify-center gap-6">
              <span aria-hidden className="hidden h-px flex-1 bg-forest/30 sm:block" />
              <Sparkle className="hidden h-3 w-3 text-forest sm:block" />
              <h2 id="also-like" className="label-wide text-center text-[13px] text-obsidian">You may also like</h2>
              <Sparkle className="hidden h-3 w-3 text-forest sm:block" />
              <span aria-hidden className="hidden h-px flex-1 bg-forest/30 sm:block" />
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {related.map((r) => <li key={r.id}><ProductCard product={r} variant="overlay" sizes="(max-width: 640px) 100vw, 33vw" /></li>)}
            </ul>
          </section>
        )}

        {siblings.length > 0 && primaryCollection && (
          <section className="mt-16" aria-labelledby="more-from">
            <h2 id="more-from" className="label-wide text-center text-charcoal">More from {primaryCollection.title.split(" / ")[0]}</h2>
            <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
              {siblings.map((c) => <li key={c.id}><ProductCard product={c} /></li>)}
            </ul>
          </section>
        )}
        <RecentlyViewed excludeId={p.id} />
      </Container>
    </>
  );
}
