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
          <span className="bag-handle bag-handle-front" />
          <span className="bag-handle bag-handle-back" />
          {/* Rope profiles: edge-on from the front, solid loops when the bag is side-on */}
          <span className="bag-handle bag-handle-edge bag-handle-front-edge" />
          <span className="bag-handle bag-handle-edge bag-handle-back-edge" />
          <div className="bag-face bag-front">
            <Image src="/brand/logo-forest.png" alt="" width={435} height={705} className="bag-logo" />
          </div>
          <div className="bag-face bag-back">
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
