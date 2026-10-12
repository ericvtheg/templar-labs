// Photo files are optional. They live in src/assets/photos, which is not in git
// yet (see projects/weddingv2/.gitignore). A slot whose file is missing shows
// its placeholder, so the site builds and works with or without the pictures.

import type { PhotoSlot } from "../content/photos.ts";

const files = import.meta.glob<string>("../assets/photos/*", {
  eager: true,
  query: "?url",
  import: "default",
});

/** The URL of a slot's picture, or null when the slot is empty or its file is absent. */
export function photoUrl(slot: PhotoSlot): string | null {
  if (slot.src === null) {
    return null;
  }
  return files[`../assets/photos/${slot.src}`] ?? null;
}
