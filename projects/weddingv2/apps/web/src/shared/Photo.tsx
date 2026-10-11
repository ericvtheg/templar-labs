import type { PhotoSlot } from "../content/photos.ts";
import { art } from "./art.ts";

type PhotoProps = {
  slot: PhotoSlot;
  className?: string;
  /** Load eagerly for photos that are visible on first paint. */
  eager?: boolean;
};

/** A photo slot. Renders the image, or a designed placeholder until `src` is set. */
export function Photo({ slot, className, eager = false }: PhotoProps) {
  const classes = className ? `photo ${className}` : "photo";

  if (slot.src !== null) {
    return (
      <div className={classes}>
        <img
          src={slot.src}
          alt={slot.alt}
          style={{ objectPosition: slot.focal }}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div className={classes} data-tone={slot.tone}>
      <div className="photo__placeholder" role="img" aria-label={`Photo to come (${slot.hint})`}>
        <img className="photo__sprig" src={art.stemCosmos} alt="" />
        <span className="photo__label">photo to come</span>
        <span className="photo__hint">{slot.hint}</span>
      </div>
    </div>
  );
}
