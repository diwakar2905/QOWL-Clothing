import Image from "next/image";

/**
 * Decorative 3D QOWL shopping bag that slowly turns in the footer.
 * Pure CSS (see .bag-* in globals.css); holds still for reduced-motion users.
 */
export function FooterBag() {
  return (
    <div aria-hidden className="bag-stage">
      <div className="bag-float">
        <div className="bag">
          <div className="bag-face bag-front">
            <span className="bag-handle" />
            <Image src="/brand/logo-forest.png" alt="" width={435} height={705} className="bag-logo" />
          </div>
          <div className="bag-face bag-back">
            <span className="bag-handle" />
            <Image src="/brand/logo-forest.png" alt="" width={435} height={705} className="bag-logo" />
          </div>
          <div className="bag-face bag-side bag-left" />
          <div className="bag-face bag-side bag-right" />
          <div className="bag-face bag-top" />
          <div className="bag-face bag-bottom" />
        </div>
      </div>
      <div className="bag-shadow" />
    </div>
  );
}
