import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { Sparkle } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Our Story",
  description: "QOWL is independent Indian streetwear for people who write their own code. Drop 001 — The Unwritten.",
  alternates: { canonical: "/our-story" },
};

const PILLARS = [
  { title: "Wear your own code", body: "Every piece starts from a single idea: what you wear should say who you are, not who you're told to be." },
  { title: "Small drops, made with care", body: "We release in numbered drops. Fewer pieces means more time on fabric, fit and the details you notice later." },
  { title: "Designed in India", body: "Independent, Indian and built for real days — heavyweight fleece, oversized cuts and artwork that's ours." },
];

export default function OurStoryPage() {
  return (
    <Container className="max-w-5xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Our story" }]} />
      <header className="mt-10 text-center">
        <p className="label-wide text-forest">Est. 2026 — India</p>
        <h1 className="display mt-4 text-5xl text-obsidian sm:text-7xl">Our Story</h1>
        <p className="mx-auto mt-5 max-w-2xl font-serif text-xl italic text-charcoal/80 sm:text-2xl">Independent streetwear for those who write their own code.</p>
      </header>

      <div className="mt-14 grid items-center gap-10 md:grid-cols-[1fr_1.1fr]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-cream">
          <Image src="/concept/hero-green-mist-mobile.webp" alt="Model in a washed black QOWL hoodie standing in green mist" fill sizes="(max-width: 768px) 100vw, 45vw" className="object-cover" />
        </div>
        <div className="space-y-5 text-[15px] leading-relaxed text-charcoal/85">
          <p>QOWL began with a blank page and a simple question: why does so much streetwear look the same? We wanted clothes that feel personal, pieces that carry a point of view without shouting it.</p>
          <p><strong className="font-semibold text-obsidian">Drop 001 — The Unwritten</strong> is our first chapter. Six pieces: essential tees, statement graphics and heavyweight hoodies, built around gothic architecture, quiet symbolism and the idea that the most interesting stories haven&apos;t been written yet.</p>
          <p>We design in small numbered drops so we can obsess over the things that matter: how a shoulder drops, how a print ages, how a hoodie feels on the hundredth wear.</p>
          <p className="font-serif text-2xl italic text-forest">Wear Your Own Code.</p>
        </div>
      </div>

      <ul className="mt-16 grid gap-5 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <li key={p.title} className="rounded-2xl bg-white/70 p-6 ring-1 ring-charcoal/[0.07]">
            <Sparkle className="h-4 w-4 text-forest" />
            <h2 className="mt-3 font-serif text-2xl uppercase leading-tight text-obsidian">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-charcoal/75">{p.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-16 flex flex-wrap justify-center gap-3">
        <Link href="/collections/drop-001" className={buttonClass("primary", "lg")}>Shop Drop 001</Link>
        <Link href="/lookbook" className={buttonClass("outline", "lg")}>View the lookbook</Link>
      </div>
    </Container>
  );
}
