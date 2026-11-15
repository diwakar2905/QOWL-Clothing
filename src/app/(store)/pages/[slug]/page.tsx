import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/server/services/settings";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { policyTitle } from "@/lib/policies";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return db.page.findFirst({ where: { slug, status: "ACTIVE" } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  if (p) return { title: p.title, description: p.seoDescription ?? undefined, alternates: { canonical: `/pages/${p.slug}` } };
  const pending = policyTitle((await params).slug);
  return pending ? { title: pending, robots: { index: false } } : {};
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const [page, settings] = await Promise.all([load(slug), getSettings()]);
  const s = settings.store;
  if (!page) {
    // A standard policy that hasn't been published yet: explain instead of a 404.
    const title = policyTitle(slug);
    if (!title) notFound();
    return (
      <Container className="max-w-3xl py-8 sm:py-12">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
        <h1 className="display mt-6 text-5xl text-obsidian">{title}</h1>
        <div className="mt-8 rounded-2xl bg-white/70 p-6 text-[15px] leading-relaxed text-charcoal/85 ring-1 ring-charcoal/[0.07]">
          <p>We&apos;re finalising this policy and it will be published here shortly.</p>
          <p className="mt-3">
            Need help in the meantime? {s.supportEmail ? <>Write to <a className="text-forest underline underline-offset-4" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> or visit </> : <>Visit </>}
            our <Link href="/contact" className="text-forest underline underline-offset-4">contact page</Link>.
          </p>
        </div>
      </Container>
    );
  }
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
