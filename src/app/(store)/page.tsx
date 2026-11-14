import { resolveHomepage } from "@/server/cms/homepage";
import { Hero } from "@/components/home/hero";
import { Campaign, CategoryTiles, Craft, LookbookTeaser, Marquee, ProductShowcase } from "@/components/home/sections";
import { parseSectionData } from "@/server/cms/sections";
import { JsonLd } from "@/components/ui/misc";
import { getSettings } from "@/server/services/settings";

export default async function HomePage() {
  const [sections, settings] = await Promise.all([resolveHomepage(), getSettings()]);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: settings.store.legalName || "QOWL", url: base, logo: `${base}/brand/icon-512.png`, sameAs: Object.values(settings.social).filter(Boolean) }} />
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
