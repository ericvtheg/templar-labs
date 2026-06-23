const STORAGE_KEY = "cardiff-split:visitor-id";

/**
 * Returns a stable per-browser visitor id used as the analytics distinct id.
 * Cardiff Split has no accounts, so this is the closest thing to a "user".
 * Returns an empty string when localStorage is unavailable.
 */
export function getVisitorId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);

    if (existing !== null && existing.length > 0) {
      return existing;
    }

    const id = `anon_${crypto.randomUUID()}`;
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return "";
  }
}
