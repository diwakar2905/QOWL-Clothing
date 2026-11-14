"""
Extracts brand assets and DEVELOPMENT-ONLY concept imagery from the supplied
QOWL reference mockups in design-references/.

- The logo is converted losslessly in shape: luminance -> alpha, recoloured to
  cream (for dark backgrounds) and forest green (for light backgrounds). The
  artwork itself is not redrawn or altered.
- Product/editorial crops are AI concept renders, NOT photographs of
  manufactured garments. They are written to public/concept/ and are only
  referenced by the development seed (clearly flagged `isConcept` in the DB).

Run:  python3 -I scripts/extract-assets.py
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "design-references"
BRAND = ROOT / "public" / "brand"
CONCEPT = ROOT / "public" / "concept"
BRAND.mkdir(parents=True, exist_ok=True)
CONCEPT.mkdir(parents=True, exist_ok=True)


def logo():
    src = Image.open(REF / "qowl-logo-original.jpg").convert("L")
    # The source JPG carries a thin light frame at its edges; exclude it.
    inset = 12
    src = src.crop((inset, inset, src.width - inset, src.height - inset))
    # Tight crop around the artwork
    bbox = src.point(lambda v: 255 if v > 60 else 0).getbbox()
    pad = 6
    bbox = (bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad)
    art = src.crop(bbox)
    art = art.resize((art.width * 3, art.height * 3), Image.LANCZOS)
    alpha = art.point(lambda v: 0 if v < 30 else min(255, int((v - 30) * 255 / 190)))
    for name, colour in {"logo-cream": (247, 244, 236), "logo-forest": (7, 61, 45), "logo-obsidian": (23, 23, 23)}.items():
        im = Image.new("RGBA", art.size, colour + (0,))
        im.putalpha(alpha)
        im.save(BRAND / f"{name}.png", optimize=True)
    # Square icon (mark only = upper ~68% of artwork)
    mark_h = int(art.height * 0.76)
    mark_alpha = alpha.crop((0, 0, art.width, mark_h))
    side = max(art.width, mark_h) + 160
    for name, colour, bg in [("icon-512", (247, 244, 236), (7, 61, 45))]:
        canvas = Image.new("RGB", (side, side), bg)
        fg = Image.new("RGB", mark_alpha.size, colour)
        canvas.paste(fg, ((side - art.width) // 2, (side - mark_h) // 2), mark_alpha)
        canvas.resize((512, 512), Image.LANCZOS).save(BRAND / f"{name}.png", optimize=True)
        canvas.resize((180, 180), Image.LANCZOS).save(BRAND / "apple-touch-icon.png", optimize=True)
        canvas.resize((48, 48), Image.LANCZOS).save(BRAND / "favicon-48.png", optimize=True)
    print("logo ok", art.size)


CROPS = {
    "drop-listing-mockup.webp": {
        "origin-front": (30, 291, 266, 595),
        "requiem-back": (280, 291, 509, 595),
        "phantom-front": (523, 291, 750, 595),
        "nocturne-front": (765, 291, 994, 595),
        "eclipse-back": (30, 680, 290, 968),
        "ashen-front": (304, 680, 566, 968),
        "detail-embroidery": (581, 680, 788, 800),
        "detail-garment-wash": (796, 680, 997, 800),
        "detail-artwork": (581, 853, 788, 970),
        "detail-construction": (796, 853, 997, 970),
        "campaign-duo": (400, 1049, 1024, 1285),
    },
    "product-detail-mockup.webp": {
        "eclipse-front": (37, 133, 347, 621),
        "eclipse-back-full": (352, 133, 655, 621),
        "eclipse-hood": (253, 633, 339, 720),
        "eclipse-standing": (346, 633, 432, 720),
        "eclipse-chest": (439, 633, 525, 720),
        "eclipse-fabric": (532, 633, 618, 720),
        "eclipse-artwork-close": (35, 756, 368, 930),
        "eclipse-fleece-close": (374, 756, 600, 930),
        "origin-alt": (36, 998, 346, 1165),
        "phantom-alt": (360, 998, 665, 1165),
        "ashen-alt": (681, 998, 987, 1165),
    },
    "collections-mockup.webp": {
        "tile-requiem": (32, 219, 349, 405),
        "tile-origin": (356, 219, 669, 405),
        "tile-ashen": (677, 219, 993, 405),
        "tile-eclipse": (32, 479, 349, 640),
        "tile-phantom": (356, 479, 669, 640),
        "tile-lookbook": (677, 479, 993, 640),
        "six-origin": (27, 1032, 186, 1213),
        "six-requiem": (193, 1032, 349, 1213),
        "six-phantom": (356, 1032, 512, 1213),
        "six-nocturne": (519, 1032, 674, 1213),
        "six-eclipse": (681, 1032, 836, 1213),
        "six-ashen": (844, 1032, 999, 1213),
    },
    "homepage-mockup.webp": {
        "hero-model": (282, 64, 418, 326),
        "lookbook-1": (241, 1602, 372, 1754),
        "lookbook-2": (378, 1602, 507, 1754),
        "lookbook-3": (513, 1602, 643, 1754),
        "craft-fabric": (25, 1460, 176, 1546),
        "craft-embroidery": (181, 1460, 332, 1546),
        "craft-construction": (337, 1460, 488, 1546),
        "craft-wash": (493, 1460, 643, 1546),
        "category-tees": (160, 1226, 328, 1382),
        "category-hoodies": (488, 1226, 649, 1382),
    },
}


def concept():
    for file, crops in CROPS.items():
        src = Image.open(REF / file).convert("RGB")
        for name, box in crops.items():
            im = src.crop(box)
            scale = 2 if im.width < 400 else 1.5
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
            im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
            im.save(CONCEPT / f"{name}.webp", quality=86, method=6)
    print("concept ok", sum(len(c) for c in CROPS.values()))


if __name__ == "__main__":
    logo()
    concept()
