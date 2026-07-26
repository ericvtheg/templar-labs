export function normalizeGuestName(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-US");
}
