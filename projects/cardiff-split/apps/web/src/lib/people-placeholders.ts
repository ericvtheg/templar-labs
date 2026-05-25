export const PEOPLE_PLACEHOLDER_NAMES = [
  "Alexis",
  "Andi",
  "Brent",
  "Carlo",
  "Emilie",
  "Emma",
  "Eric",
  "Fiona",
  "Frozenfar",
  "Gavin",
  "Gobs",
  "Ivan",
  "Jackie",
  "Jem",
  "Jesse",
  "Juliette",
  "K'love",
  "Kendall",
  "Kim",
  "Kimiko",
  "Kyle",
  "Megan",
  "Mitchell",
  "Silver",
  "Skylar",
  "Timmy",
] as const;

export type PeoplePlaceholderName = (typeof PEOPLE_PLACEHOLDER_NAMES)[number];

export const MAX_VISIBLE_PEOPLE_PLACEHOLDERS = 6;

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
