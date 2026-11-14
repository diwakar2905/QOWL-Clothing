import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Breadcrumbs, Container, EmptyState } from "@/components/ui/misc";
import { SizeTable } from "@/components/store/size-table";

export const metadata: Metadata = { title: "Size guide", alternates: { canonical: "/size-guide" } };

export default async function SizeGuidePage() {
  const guides = await db.sizeGuide.findMany({ where: { isApproved: true }, orderBy: { name: "asc" } });
  return (
    <Container className="max-w-4xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Size guide" }]} />
      <h1 className="display mt-6 text-5xl text-obsidian">Size Guide</h1>
      {guides.length === 0 ? (
        <EmptyState title="Measurements coming soon" body="Garment measurements will be published once production samples are approved." />
      ) : (
        <div className="mt-8 space-y-12">{guides.map((g) => <SizeTable key={g.id} guide={g} showName />)}</div>
      )}
    </Container>
  );
}
