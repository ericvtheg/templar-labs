export type WeddingStatus = "draft" | "published";

export type WeddingSection = {
  readonly id: "weekend" | "story" | "travel" | "stay" | "faq" | "registry";
  readonly eyebrow: string;
  readonly title: string;
  readonly placeholder: string;
  readonly published: boolean;
};

export const wedding = {
  status: "draft" as WeddingStatus,
  couple: {
    first: "Emma",
    second: "Eric",
    display: "Emma & Eric",
  },
  date: {
    iso: "2027-09-25",
    display: "September 25, 2027",
    compact: "09 · 25 · 27",
  },
  venue: {
    name: "Botanica, The Wichita Gardens",
    city: "Wichita",
    region: "Kansas",
  },
  design: {
    defaultFontDirection: "playful",
    defaultPaperTone: "ivory",
  },
  sections: [
    {
      id: "weekend",
      eyebrow: "The weekend",
      title: "Meet us in the garden",
      placeholder: "The confirmed ceremony, reception, and weekend schedule will be added here.",
      published: false,
    },
    {
      id: "story",
      eyebrow: "Our story",
      title: "In our own words",
      placeholder:
        "This is where Emma and Eric can share their story. No placeholder biography will be published.",
      published: false,
    },
    {
      id: "travel",
      eyebrow: "Travel",
      title: "Getting to Wichita",
      placeholder:
        "Confirmed hotel, transportation, parking, and local recommendations will be added here.",
      published: false,
    },
    {
      id: "stay",
      eyebrow: "While you’re here",
      title: "Make the most of your stay",
      placeholder:
        "A few of Emma and Eric’s favorite Wichita activities, places to explore, and things to eat and drink will be added here.",
      published: false,
    },
    {
      id: "faq",
      eyebrow: "Good to know",
      title: "Questions, answered",
      placeholder: "FAQs supplied by Emma and Eric will be added here.",
      published: false,
    },
    {
      id: "registry",
      eyebrow: "Registry",
      title: "Gifts & good wishes",
      placeholder: "Registry information will be added only after it is confirmed.",
      published: false,
    },
  ] satisfies ReadonlyArray<WeddingSection>,
} as const;
