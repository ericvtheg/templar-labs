// Photo files for the things to do. Photos of places are in git. Photos of Emma
// and Eric are optional local files (see shared/photoFiles.ts), so a missing one
// falls back to a placeholder.

import type { Activity } from "../content/site.ts";
import { photoFile } from "../shared/photoFiles.ts";

const places = import.meta.glob<string>("../assets/round-4/places/*", {
  eager: true,
  query: "?url",
  import: "default",
});

/** The URL of an activity's photo, or null when its file is not there. */
export function activityPhoto(activity: Activity): string | null {
  const { file, ofUs } = activity.photo;
  return ofUs ? photoFile(file) : (places[`../assets/round-4/places/${file}`] ?? null);
}
