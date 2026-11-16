import { getProductDetail } from "@/server/services/catalog";
import { brandCard, OG_SIZE, OG_TYPE, productCard } from "@/server/og";
import { formatINR } from "@/lib/money";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "QOWL product";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProductDetail((await params).slug);
  if (!p) return brandCard({ kicker: "QOWL", title: "Wear Your Own Code", line: "Independent Indian streetwear." });
  const sizes = [...new Set(p.variants.map((v) => v.size))];
  const meta = [sizes.length > 1 ? `Sizes ${sizes[0]}–${sizes.at(-1)}` : sizes[0] ? `Size ${sizes[0]}` : null, p.colors.length > 1 ? `${p.colors.length} colours` : p.colors[0]?.name].filter(Boolean).join(" · ");
  const collection = p.visibleCollections.find((c) => c.slug === "drop-001") ?? p.visibleCollections[0];
  return productCard({
    name: p.name,
    type: p.subtitle ? `${p.subtitle} · ${p.garmentType}` : p.garmentType,
    price: formatINR(p.effectivePrice),
    mrp: p.mrp > p.effectivePrice ? formatINR(p.mrp) : null,
    meta,
    image: p.images[0]?.url ?? null,
    kicker: collection ? collection.title : p.category.name,
  });
}
