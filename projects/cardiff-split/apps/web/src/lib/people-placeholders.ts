export const PEOPLE_PLACEHOLDER_NAMES = [
  "Alexis",
  "Andi",
  "Bo",
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
export const PEOPLE_PLACEHOLDER_CYCLE_LENGTH = PEOPLE_PLACEHOLDER_NAMES.length;

export function initialPeoplePlaceholderNames(
  randomIndex: (maxExclusive: number) => number = randomInteger,
): PeoplePlaceholderName[] {
  const names = [...PEOPLE_PLACEHOLDER_NAMES];

  for (let index = names.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    const currentName = names[index];
    const swapName = names[swapIndex];

    if (currentName === undefined || swapName === undefined) {
      continue;
    }

    [names[index], names[swapIndex]] = [swapName, currentName];
  }

  return names;
}

export function nextPeoplePlaceholderNames(
  currentNames: readonly PeoplePlaceholderName[],
): PeoplePlaceholderName[] {
  const nextName = currentNames[currentNames.length - 1];

  if (nextName === undefined) {
    return [];
  }

  return [nextName, ...currentNames.slice(0, -1)];
}

function randomInteger(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}
