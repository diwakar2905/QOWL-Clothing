"use client";

import { getImageProps } from "next/image";
import { preload } from "react-dom";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn, safeHref } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "@/components/ui/icons";
import { ConceptBadge } from "@/components/ui/misc";

export type HeroSlideData = {
  id: string; eyebrow: string | null; heading: string; subheading: string | null; desktopImageUrl: string; mobileImageUrl: string | null; imageAlt: string; isConcept: boolean;
  primaryLabel: string | null; primaryHref: string | null; secondaryLabel: string | null; secondaryHref: string | null; sideLabels: string[];
};

export function Hero({ slides, autoplay, interval }: { slides: HeroSlideData[]; autoplay: boolean; interval: number }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay && slides.length > 1);
  const count = slides.length;
  const go = useCallback((i: number) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    // Never auto-advance for users who prefer reduced motion.
    if (!playing || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), interval * 1000);
    return () => clearInterval(t);
  }, [playing, count, interval]);

  return (
    <section aria-roledescription={count > 1 ? "carousel" : undefined} aria-label="Featured" className="haze on-dark relative isolate overflow-hidden text-ivory">
      {slides.map((s, i) => {
        const primary = safeHref(s.primaryHref);
        const secondary = safeHref(s.secondaryHref);
        const active = i === index;
        const words = s.heading.split(" ");
        return (
          <div key={s.id} aria-roledescription={count > 1 ? "slide" : undefined} aria-label={count > 1 ? `${i + 1} of ${count}` : undefined} hidden={!active} className="relative">
            {/* Full-bleed campaign image; a dark fade keeps the copy readable */}
            <HeroPicture desktop={s.desktopImageUrl} mobile={s.mobileImageUrl} alt={s.imageAlt} first={i === 0} />
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-forest-deep/90 via-forest-deep/25 to-forest-deep/40 lg:bg-gradient-to-r lg:from-forest-deep/80 lg:via-forest-deep/20 lg:to-transparent" />
            <div className="mx-auto grid min-h-[min(100svh,820px)] max-w-[1440px] lg:min-h-[56.25vw] grid-rows-[1fr_auto] px-5 pt-[84px] sm:px-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(160px,320px)_minmax(0,0.7fr)] lg:grid-rows-1 lg:px-12">
              <div className="relative z-10 flex flex-col justify-end pb-10 lg:order-1 lg:justify-center lg:pb-0">
                {/* The first slide's eyebrow + heading form the page's single <h1> ("QOWL / Drop 001 — The Unwritten"); other slides use <h2>. */}
                {(() => {
                  const Heading = i === 0 ? "h1" : "h2";
                  return (
                    <Heading>
                      {s.eyebrow && (
                        <span className="label-wide flex items-center gap-4 text-ivory/90 animate-rise">
                          {s.eyebrow}
                          <span aria-hidden className="h-px w-14 bg-ivory/60" />
                        </span>
                      )}
                      <span className="display mt-5 block text-[3.6rem] leading-[0.9] sm:text-7xl lg:text-[min(5.2vw,5.4rem)] animate-rise [animation-delay:120ms]">
                        <span className="sr-only">{s.eyebrow ? " — " : ""}</span>
                        {words.length > 1 ? (
                          <>
                            {words.slice(0, -1).join(" ")}
                            <br />
                            {words[words.length - 1]}
                          </>
                        ) : (
                          s.heading
                        )}
                      </span>
                    </Heading>
                  );
                })()}
                {s.subheading && <p className="mt-4 font-serif text-xl italic text-ivory/90 sm:text-2xl animate-rise [animation-delay:240ms]">{s.subheading}</p>}
                <div className="mt-8 flex flex-wrap gap-3 animate-rise [animation-delay:360ms]">
                  {primary && s.primaryLabel && (
                    <Link href={primary} className={buttonClass("primary", "md", "bg-forest-deep border-ivory/20")}>
                      {s.primaryLabel} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  {secondary && s.secondaryLabel && (
                    <Link href={secondary} className={buttonClass("light", "md")}>{s.secondaryLabel}</Link>
                  )}
                </div>
              </div>
              {s.sideLabels.length > 0 && (
                <ul className="relative z-10 hidden flex-col justify-center gap-3 self-center justify-self-end border-l border-ivory/40 py-2 pl-6 lg:order-3 lg:col-start-3 lg:flex">
                  {s.sideLabels.map((l) => (
                    <li key={l} className="label-wide text-ivory/85">{l}</li>
                  ))}
                </ul>
              )}
            </div>
            {s.isConcept && <ConceptBadge className="absolute bottom-3 right-3 z-10" />}
          </div>
        );
      })}
      {count > 1 && (
        <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="p-2 hover:opacity-70"><ChevronLeft className="h-4 w-4" /></button>
          {slides.map((s, i) => (
            <button key={s.id} type="button" onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} aria-current={i === index} className={cn("h-1.5 rounded-full bg-ivory transition-all", i === index ? "w-6" : "w-1.5 opacity-50")} />
          ))}
          <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="p-2 hover:opacity-70"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause slideshow" : "Play slideshow"} className="p-2 hover:opacity-70">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Art-directed hero image: optimised srcsets for the portrait mobile crop and the
 * wide desktop photo, each preloaded only for its own viewport so the browser
 * fetches the LCP image immediately and never downloads both.
 */
function HeroPicture({ desktop, mobile, alt, first }: { desktop: string; mobile: string | null; alt: string; first: boolean }) {
  const common = { alt, fill: true, sizes: "100vw", priority: first } as const;
  const { props: { srcSet: desktopSet, ...img } } = getImageProps({ ...common, src: desktop });
  const mobileSet = mobile ? getImageProps({ ...common, src: mobile }).props.srcSet : undefined;
  if (first) {
    const MOBILE = "(max-width: 767px)";
    if (mobileSet && mobile) preload(mobile, { as: "image", imageSrcSet: mobileSet, imageSizes: "100vw", media: MOBILE, fetchPriority: "high" });
    preload(desktop, { as: "image", imageSrcSet: desktopSet, imageSizes: "100vw", media: mobileSet ? "(min-width: 768px)" : undefined, fetchPriority: "high" });
  }
  return (
    <picture className="pointer-events-none absolute inset-0 -z-10 block">
      {mobileSet && <source media="(max-width: 767px)" srcSet={mobileSet} sizes="100vw" />}
      <source media={mobileSet ? "(min-width: 768px)" : undefined} srcSet={desktopSet} sizes="100vw" />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
      <img {...img} className="object-cover object-[50%_30%] lg:object-top" />
    </picture>
  );
}
