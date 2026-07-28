export type WeddingEventId = "wedding" | "rehearsal-dinner";

export type MealOption = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

export type RsvpEvent = {
  readonly id: WeddingEventId;
  readonly title: string;
  readonly shortTitle: string;
  readonly date: string | null;
  readonly location: string | null;
  readonly detail: string;
  readonly mealOptions: readonly MealOption[];
};

export const rsvpEvents = [
  {
    id: "rehearsal-dinner",
    title: "Rehearsal dinner",
    shortTitle: "Rehearsal dinner",
    date: null,
    location: null,
    detail: "Details will be shared when they are confirmed.",
    mealOptions: [],
  },
  {
    id: "wedding",
    title: "Wedding celebration",
    shortTitle: "Wedding",
    date: "September 25, 2027",
    location: "Botanica, The Wichita Gardens · Wichita, Kansas",
    detail: "Ceremony and reception",
    mealOptions: [
      {
        id: "herb-roasted-chicken",
        label: "Herb-roasted chicken",
        description: "Mock menu selection",
      },
      {
        id: "braised-beef",
        label: "Braised beef",
        description: "Mock menu selection",
      },
      {
        id: "wild-mushroom-risotto",
        label: "Wild mushroom risotto",
        description: "Vegetarian · mock menu selection",
      },
      {
        id: "childrens-meal",
        label: "Children’s meal",
        description: "Mock menu selection",
      },
    ],
  },
] as const satisfies readonly RsvpEvent[];

export const defaultEventIds = ["wedding"] as const satisfies readonly WeddingEventId[];

export function eventById(eventId: string): RsvpEvent | undefined {
  return rsvpEvents.find((event) => event.id === eventId);
}

export function mealOptionById(eventId: string, mealOptionId: string): MealOption | undefined {
  return eventById(eventId)?.mealOptions.find((option) => option.id === mealOptionId);
}

export function isWeddingEventId(value: string): value is WeddingEventId {
  return rsvpEvents.some((event) => event.id === value);
}
