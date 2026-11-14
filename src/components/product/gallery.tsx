"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ZoomIn } from "@/components/ui/icons";
import { ConceptBadge } from "@/components/ui/misc";

export type GalleryImage = { id: string; url: string; alt: string; isConcept: boolean; width: number | null; height: number | null };

export function Gallery({ images, conceptNotice }: { images: GalleryImage[]; conceptNotice: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [mobileIndex, setMobileIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);

  if (!images.length) return <div className="flex aspect-[4/5] items-center justify-center bg-cream text-sm text-stone">Imagery coming soon</div>;
  const pair = [images[active], images[(active + 1) % images.length]].filter((x, i, a) => x && (i === 0 || a[0] !== x)) as GalleryImage[];
  const anyConcept = images.some((i) => i.isConcept);

  return (
    <div>
      {/* Mobile: swipeable, scroll-snapped */}
      <div className="relative lg:hidden">
        <div
          ref={scroller}
          className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:-mx-6"
          onScroll={(e) => setMobileIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          aria-label="Product images"
          role="region"
          tabIndex={0}
        >
          {images.map((im, i) => (
            <button key={im.id} type="button" onClick={() => setZoom(i)} className="relative aspect-[4/5] w-full shrink-0 snap-center bg-cream" aria-label={`Zoom image ${i + 1} of ${images.length}`}>
              <Image src={im.url} alt={im.alt} fill priority={i === 0} sizes="(max-width: 1023px) 100vw, 1px" className="object-cover" />
              {im.isConcept && <ConceptBadge className="absolute left-3 top-3" />}
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((im, i) => <span key={im.id} className={cn("h-1.5 rounded-full bg-forest transition-all", i === mobileIndex ? "w-5" : "w-1.5 opacity-30")} />)}
          </div>
        )}
      </div>

      {/* Desktop: editorial pair + thumbnail rail */}
      <div className="hidden lg:block">
        <div className={cn("grid gap-2", pair.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {pair.map((im, i) => (
            <button key={im.id} type="button" onClick={() => setZoom(images.indexOf(im))} className="group relative aspect-[3/4.6] overflow-hidden rounded-[3px] bg-cream" aria-label={`Zoom: ${im.alt}`}>
              <Image src={im.url} alt={im.alt} fill priority={i === 0} sizes="(max-width: 1440px) 30vw, 440px" className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
              <span className="absolute bottom-3 right-3 bg-ivory/85 p-2 opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn className="h-4 w-4" /></span>
              {im.isConcept && <ConceptBadge className="absolute left-3 top-3" />}
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => setActive((a) => (a - 1 + images.length) % images.length)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border hairline hover:border-forest" aria-label="Previous images">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div ref={thumbs} className="scrollbar-none flex flex-1 gap-2 overflow-x-auto" role="list">
              {images.map((im, i) => (
                <button
                  key={im.id}
                  role="listitem"
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show image ${i + 1}: ${im.alt}`}
                  aria-current={i === active}
                  className={cn("relative aspect-square w-[88px] shrink-0 overflow-hidden rounded-[3px] border-2 bg-cream", i === active ? "border-forest" : "border-transparent opacity-80 hover:opacity-100")}
                >
                  <Image src={im.url} alt="" fill sizes="88px" className="object-cover" />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setActive((a) => (a + 1) % images.length)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border hairline hover:border-forest" aria-label="Next images">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {anyConcept && <p className="mt-3 text-xs text-stone">{conceptNotice}</p>}

      <Dialog open={zoom !== null} onClose={() => setZoom(null)} title="Image zoom" className="!max-w-[min(96vw,1100px)] bg-obsidian">
        {zoom !== null && images[zoom] && (
          <div className="relative bg-obsidian">
            <div className="max-h-[80dvh] overflow-auto">
              <Image src={images[zoom].url} alt={images[zoom].alt} width={images[zoom].width ?? 1200} height={images[zoom].height ?? 1500} sizes="96vw" className="mx-auto h-auto w-full max-w-[1100px] cursor-zoom-out" onClick={() => setZoom(null)} />
            </div>
            {images.length > 1 && (
              <div className="flex items-center justify-between px-4 py-3 text-ivory">
                <button type="button" onClick={() => setZoom((z) => ((z ?? 0) - 1 + images.length) % images.length)} className="p-2" aria-label="Previous image"><ChevronLeft className="h-5 w-5" /></button>
                <span className="text-xs tabular-nums">{zoom + 1} / {images.length}</span>
                <button type="button" onClick={() => setZoom((z) => ((z ?? 0) + 1) % images.length)} className="p-2" aria-label="Next image"><ChevronRight className="h-5 w-5" /></button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
