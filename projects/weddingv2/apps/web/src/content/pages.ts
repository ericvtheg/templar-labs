// Pages and design versions. Every page has its own URL in every version.

export type PageId = "home" | "schedule" | "travel" | "stay" | "things-to-do" | "faq";
export type VersionId = "v1" | "v2" | "v3" | "v4" | "v5";

export type Page = {
  id: PageId;
  slug: string;
  /** Navigation label. */
  label: string;
  /** Browser tab title. */
  title: string;
};

export const pages: readonly Page[] = [
  { id: "home", slug: "", label: "Home", title: "Emma & Eric" },
  { id: "schedule", slug: "schedule", label: "Schedule", title: "The Schedule" },
  { id: "travel", slug: "travel", label: "Travel", title: "Travel" },
  { id: "stay", slug: "stay", label: "Stay", title: "Where to Stay" },
  { id: "things-to-do", slug: "things-to-do", label: "Things to Do", title: "Things to Do" },
  { id: "faq", slug: "faq", label: "FAQ", title: "Frequently Asked Questions" },
];

/** Labels for the two halves of Travel, where a version shows them as one section. */
export const travelParts = [
  { id: "travel", label: "Getting here" },
  { id: "stay", label: "Where to stay" },
] as const satisfies readonly { id: PageId; label: string }[];

export type Version = {
  id: VersionId;
  number: string;
  name: string;
  blurb: string;
  /** 1 is the first exploration. 2 follows Emma's feedback on it. */
  round: 1 | 2;
};

export const versions: readonly Version[] = [
  {
    id: "v4",
    number: "04",
    name: "As Emma made it",
    blurb: "Her Canva, panel for panel: her fonts, her coral, her scroll. One spot for a photo.",
    round: 2,
  },
  {
    id: "v5",
    number: "05",
    name: "The same, no photo",
    blurb: "Exactly 04, with nothing added to her homepage.",
    round: 2,
  },
  {
    id: "v1",
    number: "01",
    name: "As is",
    blurb: "Emma’s Canva design, page for page. Same type, palette and florals, split into pages.",
    round: 1,
  },
  {
    id: "v2",
    number: "02",
    name: "Riffed",
    blurb: "The same design, come alive. Swaying florals, drifting petals and paper you can feel.",
    round: 1,
  },
  {
    id: "v3",
    number: "03",
    name: "Super riffed",
    blurb: "The invitation suite, opened on a garden-party table in dappled light.",
    round: 1,
  },
];

export function pagePath(version: VersionId, page: PageId): string {
  const slug = pages.find((candidate) => candidate.id === page)?.slug ?? "";
  return slug === "" ? `/${version}` : `/${version}/${slug}`;
}

export function pageById(id: PageId): Page {
  const page = pages.find((candidate) => candidate.id === id);
  if (!page) {
    throw new Error(`Unknown page: ${id}`);
  }
  return page;
}
