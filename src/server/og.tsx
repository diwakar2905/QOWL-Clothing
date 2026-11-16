import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { siteUrl } from "@/lib/seo";

/** Branded Open Graph / social share cards (1200×630) for QOWL pages. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const FOREST = "#073d2d";
const FOREST_DEEP = "#04271f";
const IVORY = "#f7f4ec";
const MIST = "#9fbfb0";

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 600; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(process.cwd(), "node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff")),
    readFile(join(process.cwd(), "node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff")),
  ]).then(([m, s]) => [
    { name: "Cormorant", data: m, weight: 500 as const, style: "normal" as const },
    { name: "Cormorant", data: s, weight: 600 as const, style: "normal" as const },
  ]);
  return fonts;
}

let logo: Promise<string> | null = null;
function loadLogo() {
  logo ??= readFile(join(process.cwd(), "public/brand/logo-cream.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`);
  return logo;
}

/** Fetch a site image (local /concept/… or Cloudinary) and convert to PNG — satori can't decode WebP. */
export async function ogPhoto(url: string | null | undefined, width = 600, height = 630): Promise<string | null> {
  if (!url) return null;
  try {
    let input: Buffer;
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      input = Buffer.from(await res.arrayBuffer());
    } else {
      // Local asset: read from public/ instead of calling our own server.
      const clean = decodeURIComponent(url.split("?")[0]).replace(/^\/+/, "");
      if (clean.includes("..")) return null;
      input = await readFile(join(process.cwd(), "public", clean));
    }
    const png = await sharp(input).resize(width, height, { fit: "cover", position: "attention" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The bundled serif has no ₹ glyph, so draw it (Lucide "indian-rupee" path). */
function Price({ text, size, color, strike }: { text: string; size: number; color?: string; strike?: boolean }) {
  const amount = text.replace(/^₹\s?/, "");
  const icon = Math.round(size * 0.78);
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: size, fontWeight: 600, color, textDecoration: strike ? "line-through" : "none" }}>
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke={color ?? IVORY} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
        <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" />
      </svg>
      {amount}
    </div>
  );
}

/** Text that may contain "₹1,899": swaps the sign for the drawn glyph. */
function Rich({ text, size, color }: { text: string; size: number; color: string }) {
  const parts = text.split("₹");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", fontSize: size, color, lineHeight: 1.35 }}>
      {parts.map((part, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", whiteSpace: "pre" }}>
          {i > 0 && (
            <svg width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" />
            </svg>
          )}
          {part}
        </div>
      ))}
    </div>
  );
}

const host = () => new URL(siteUrl()).host.replace(/^www\./, "");

async function render(node: React.ReactElement) {
  return new ImageResponse(node, { ...OG_SIZE, fonts: await loadFonts() });
}

/** Brand card: used for the homepage and any store page without its own card. */
export async function brandCard({ title, kicker, line }: { title: string; kicker: string; line: string }) {
  const [l, hero] = await Promise.all([loadLogo(), ogPhoto("/concept/hero-green-mist.webp", 820, 630)]);
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: FOREST_DEEP, color: IVORY }}>
      {hero && <img src={hero} alt="" width={820} height={630} style={{ position: "absolute", top: 0, left: 380 }} />}
      <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: `linear-gradient(90deg, ${FOREST_DEEP} 0%, ${FOREST_DEEP} 36%, rgba(4,39,31,0.7) 52%, rgba(4,39,31,0) 72%)` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px", width: 700 }}>
        <img src={l} alt="" width={78} height={126} />
        <div style={{ display: "flex", marginTop: 28, fontSize: 18, letterSpacing: 6, color: MIST, textTransform: "uppercase" }}>{kicker}</div>
        <div style={{ display: "flex", marginTop: 14, fontFamily: "Cormorant", fontWeight: 600, fontSize: 84, lineHeight: 0.95, textTransform: "uppercase" }}>{title}</div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 26, color: "rgba(247,244,236,0.85)", lineHeight: 1.35 }}>{line}</div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 20, letterSpacing: 3, color: MIST }}>{host()}</div>
      </div>
    </div>,
  );
}

/** Product card: photo left, name / type / price right. */
export async function productCard(p: { name: string; type: string; price: string; mrp?: string | null; meta: string; image: string | null; kicker: string }) {
  const [l, photo] = await Promise.all([loadLogo(), ogPhoto(p.image, 560, 630)]);
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", background: FOREST, color: IVORY }}>
      <div style={{ width: 560, height: 630, display: "flex", background: FOREST_DEEP }}>
        {photo && <img src={photo} alt="" width={560} height={630} style={{ objectFit: "cover" }} />}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 60px", background: `linear-gradient(160deg, ${FOREST} 0%, ${FOREST_DEEP} 100%)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 17, letterSpacing: 5, color: MIST, textTransform: "uppercase" }}>{p.kicker}</div>
          <img src={l} alt="" width={44} height={71} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Cormorant", fontWeight: 600, fontSize: 96, lineHeight: 0.92, textTransform: "uppercase" }}>{p.name}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 30, color: "rgba(247,244,236,0.85)" }}>{p.type}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
            <Price text={p.price} size={46} />
            {p.mrp && <div style={{ display: "flex", marginLeft: 18 }}><Price text={p.mrp} size={28} color={MIST} strike /></div>}
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 22, color: MIST }}>{p.meta}</div>
        </div>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: MIST }}>{host()}</div>
      </div>
    </div>,
  );
}

/** Listing card (category / collection): title, facts and up to three product photos. */
export async function listingCard(l: { title: string; kicker: string; line: string; images: (string | null)[] }) {
  const [logoSrc, ...photos] = await Promise.all([loadLogo(), ...l.images.slice(0, 3).map((u) => ogPhoto(u, 360, 480))]);
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", background: `linear-gradient(150deg, ${FOREST} 0%, ${FOREST_DEEP} 100%)`, color: IVORY }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 18, letterSpacing: 6, color: MIST, textTransform: "uppercase" }}>{l.kicker}</div>
        <img src={logoSrc} alt="" width={44} height={71} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ display: "flex", fontFamily: "Cormorant", fontWeight: 600, fontSize: 80, lineHeight: 0.95, textTransform: "uppercase" }}>{l.title}</div>
          <div style={{ display: "flex", marginTop: 20 }}><Rich text={l.line} size={26} color="rgba(247,244,236,0.85)" /></div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 20, letterSpacing: 3, color: MIST }}>{host()}</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {photos.filter(Boolean).map((src, i) => (
            <img key={i} src={src!} alt="" width={180} height={240} style={{ objectFit: "cover", borderRadius: 18 }} />
          ))}
        </div>
      </div>
    </div>,
  );
}
