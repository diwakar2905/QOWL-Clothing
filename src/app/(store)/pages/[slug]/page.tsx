import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/server/services/settings";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { formatDate } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return db.page.findFirst({ where: { slug, status: "ACTIVE" } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.title, description: p.seoDescription ?? undefined, alternates: { canonical: `/pages/${p.slug}` } } : {};
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const [page, settings] = await Promise.all([load(slug), getSettings()]);
  if (!page) notFound();
  const s = settings.store;
  const showGrievance = slug === "grievance-redressal" || slug === "terms-of-service";
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: page.title }]} />
      <h1 className="display mt-6 text-5xl text-obsidian">{page.title}</h1>
      <p className="mt-2 text-xs text-stone">Last updated {formatDate(page.updatedAt)}</p>
      <div className="mt-8"><Markdown source={page.body} /></div>
      {showGrievance && (s.grievanceOfficerName || s.grievanceOfficerEmail) && (
        <section className="mt-10 border hairline p-5 text-sm" aria-labelledby="grievance">
          <h2 id="grievance" className="label mb-3">Grievance Officer</h2>
          {s.grievanceOfficerName && <p>{s.grievanceOfficerName}{s.grievanceOfficerDesignation && `, ${s.grievanceOfficerDesignation}`}</p>}
          {s.grievanceOfficerEmail && <p><a className="text-forest underline" href={`mailto:${s.grievanceOfficerEmail}`}>{s.grievanceOfficerEmail}</a></p>}
          {s.grievanceOfficerPhone && <p>{s.grievanceOfficerPhone}</p>}
          {s.legalName && <p className="mt-2 text-stone">{s.legalName}{s.registeredAddress && ` — ${s.registeredAddress}`}</p>}
        </section>
      )}
    </Container>
  );
}
