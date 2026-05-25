export const PEOPLE_PLACEHOLDER_NAMES = [
  "Fiona",
  "Emma",
  "Eric",
  "K'love",
  "Jackie",
  "Gavin",
  "Timmy",
  "Andi",
  "Juliette",
  "Jem",
  "Kyle",
  "Jesse",
  "Skylar",
  "Kimiko",
  "Megan",
  "Emilie",
  "Ivan",
  "Silver",
  "Gobs",
  "Brent",
  "Carlo",
  "Kendall",
  "Alexis",
  "Kim",
  "Mitchell",
] as const;

export type PeoplePlaceholderName = (typeof PEOPLE_PLACEHOLDER_NAMES)[number];

export const MAX_VISIBLE_PEOPLE_PLACEHOLDERS = 4;

export function initialPeoplePlaceholderNames(): PeoplePlaceholderName[] {
  return PEOPLE_PLACEHOLDER_NAMES.slice(0, MAX_VISIBLE_PEOPLE_PLACEHOLDERS);
}

export function nextPeoplePlaceholderNames(
  currentNames: readonly PeoplePlaceholderName[],
  randomIndex: (maxExclusive: number) => number = randomInteger,
): PeoplePlaceholderName[] {
  const visibleNames = new Set(currentNames);
  const candidateNames = PEOPLE_PLACEHOLDER_NAMES.filter((name) => !visibleNames.has(name));
  const nextName = candidateNames[randomIndex(candidateNames.length)];

  if (nextName === undefined) {
    return currentNames.slice(0, MAX_VISIBLE_PEOPLE_PLACEHOLDERS);
  }

  return [nextName, ...currentNames].slice(0, MAX_VISIBLE_PEOPLE_PLACEHOLDERS);
}

function randomInteger(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}
