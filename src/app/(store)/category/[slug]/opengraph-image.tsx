import { getCategory, listProducts } from "@/server/services/catalog";
import { brandCard, listingCard, OG_SIZE, OG_TYPE } from "@/server/og";
import { listingFacts } from "@/lib/seo";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "QOWL category";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const c = await getCategory((await params).slug);
  if (!c) return brandCard({ kicker: "QOWL", title: "Wear Your Own Code", line: "Independent Indian streetwear." });
  const { items, total } = await listProducts({ category: c.slug, perPage: 12 });
  return listingCard({ kicker: "QOWL · Shop", title: c.name, line: listingFacts(total, items.map((i) => i.price)) || c.description || "", images: items.map((i) => i.primaryImage?.url ?? null) });
}
