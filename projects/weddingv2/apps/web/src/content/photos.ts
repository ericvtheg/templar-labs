// The one file to edit when the engagement photos arrive.
//
// 1. Put the image in apps/web/src/assets/photos/ (for example hero.jpg).
// 2. Set `src` to its file name (for example "hero.jpg").
// 3. Write real `alt` text and, if the crop is off, move the focal point.
//
// A slot with `src: null`, or whose file is missing, shows a designed placeholder. Every version crops with
// object-fit: cover, so any aspect ratio works. `focal` is a CSS object-position.

export type PhotoTone = "blush" | "ochre" | "sage";

export type PhotoSlot = {
  id: string;
  src: string | null;
  alt: string;
  focal: string;
  /** What kind of picture suits this slot. Shown on the placeholder. */
  hint: string;
  /** Placeholder tint. */
  tone: PhotoTone;
  /** Handwritten caption for versions that show one. Reuses words from the Canva design. */
  caption: string;
};

// The photo Emma placed in her Canva design. It is cut from her 1366-pixel export,
// so it is small (645 x 468). Replace the file with the original for a sharp picture.
export const heroPhoto: PhotoSlot = {
  id: "hero",
  src: "emma-eric.jpg",
  alt: "Emma and Eric smiling in front of the ocean. Emma’s hand, with her engagement ring, rests on Eric’s chest.",
  focal: "50% 35%",
  hint: "Hero · portrait",
  tone: "blush",
  caption: "Meet us in Kansas?",
};

export const supportingPhotos: readonly PhotoSlot[] = [
  {
    id: "second",
    src: null,
    alt: "Emma and Eric",
    focal: "50% 50%",
    hint: "Portrait",
    tone: "ochre",
    caption: "Wichita, Kansas",
  },
  {
    id: "third",
    src: null,
    alt: "Emma and Eric",
    focal: "50% 50%",
    hint: "Landscape",
    tone: "sage",
    caption: "September 25, 2027",
  },
  {
    id: "fourth",
    src: null,
    alt: "Emma and Eric",
    focal: "50% 50%",
    hint: "Square",
    tone: "blush",
    caption: "The Wedding",
  },
];

export const allPhotos: readonly PhotoSlot[] = [heroPhoto, ...supportingPhotos];
