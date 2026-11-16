import { getCollection, listProducts } from "@/server/services/catalog";
import { brandCard, listingCard, OG_SIZE, OG_TYPE } from "@/server/og";
import { listingFacts } from "@/lib/seo";

export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = "QOWL collection";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const c = await getCollection((await params).slug);
  if (!c) return brandCard({ kicker: "QOWL", title: "Wear Your Own Code", line: "Independent Indian streetwear." });
  const { items, total } = await listProducts({ collection: c.slug, perPage: 12 });
  return listingCard({ kicker: c.eyebrow ?? "QOWL Collection", title: c.title.split(" / ")[0]!, line: [c.title.split(" / ")[1], listingFacts(total, items.map((i) => i.price))].filter(Boolean).join(" · ") || c.description || "", images: items.map((i) => i.primaryImage?.url ?? null) });
}
