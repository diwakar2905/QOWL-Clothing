import { resolveHomepage } from "@/server/cms/homepage";
import { Hero } from "@/components/home/hero";
import { Campaign, CategoryTiles, Craft, LookbookTeaser, Marquee, ProductShowcase } from "@/components/home/sections";
import { parseSectionData } from "@/server/cms/sections";
import { JsonLd } from "@/components/ui/misc";
import { getSettings } from "@/server/services/settings";
import type { Metadata } from "next";
import { graph, organizationLd, storeFacts, websiteLd } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [sections, settings] = await Promise.all([resolveHomepage(), getSettings()]);
  const facts = storeFacts(settings);
  return (
    <>
      <JsonLd data={graph(organizationLd(facts), websiteLd(facts))} />
      {sections[0]?.type !== "HERO" && <div aria-hidden className="haze h-[68px] lg:h-[84px]" />}
      {sections.map((s) => {
        switch (s.type) {
          case "HERO":
            return <Hero key={s.id} slides={s.slides} autoplay={s.data.autoplay} interval={s.data.intervalSeconds} />;
          case "MARQUEE":
            return <Marquee key={s.id} data={parseSectionData("MARQUEE", s.data)} />;
          case "PRODUCT_GRID":
            return <ProductShowcase key={s.id} data={s.data} products={s.products} />;
          case "CAMPAIGN":
            return <Campaign key={s.id} data={parseSectionData("CAMPAIGN", s.data)} />;
          case "CATEGORY_TILES":
            return <CategoryTiles key={s.id} data={parseSectionData("CATEGORY_TILES", s.data)} />;
          case "CRAFT":
            return <Craft key={s.id} data={parseSectionData("CRAFT", s.data)} />;
          case "LOOKBOOK":
            return <LookbookTeaser key={s.id} data={s.data} images={s.images} />;
          default:
            return null;
        }
      })}
    </>
  );
}
