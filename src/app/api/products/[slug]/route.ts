import { getProductDetail } from "@/server/services/catalog";
import { notFound as nf } from "@/lib/errors";
import { handle, json } from "@/server/api";

/** Quick-view payload: public catalogue fields only (no costs or internal data). */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const p = await getProductDetail(slug);
  if (!p) throw nf("Product");
  return json({
    id: p.id,
    name: p.name,
    slug: p.slug,
    subtitle: p.subtitle,
    description: p.description,
    price: p.effectivePrice,
    mrp: p.mrp,
    colors: p.colors.map((c) => ({ id: c.id, name: c.name, hex: c.hex })),
    images: p.images.map((i) => ({ url: i.url, alt: i.alt, colorId: i.colorId, isConcept: i.isConcept })),
    variants: p.variants.map((v) => ({ id: v.id, colorId: v.colorId, size: v.size, price: v.price, available: v.available })),
  });
});
