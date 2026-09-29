import { z } from "zod";

const shortText = z.string().trim().min(1).max(120);
const bodyText = z.string().trim().min(1).max(2_000);
const optionalText = z.string().trim().max(500);
const blockBase = {
  id: z.string().trim().min(1).max(100),
  visible: z.boolean(),
};

const safeLink = z.string().trim().max(2_000).refine(isSafeLink, {
  message: "Use an HTTPS, page-anchor, or site-relative link.",
});

export const safeImageUrl = z.string().trim().max(2_000).refine(isSafeImageUrl, {
  message: "Use an HTTPS image URL or a site-relative image path.",
});

const heroBlock = z
  .object({
    type: z.literal("HeroBlock"),
    props: z
      .object({
        ...blockBase,
        eyebrow: shortText,
        firstName: shortText,
        secondName: shortText,
        date: shortText,
        venue: shortText,
        location: shortText,
        primaryLabel: shortText,
        primaryHref: safeLink,
      })
      .strict(),
  })
  .strict();

const detailsBlock = z
  .object({
    type: z.literal("DetailsBlock"),
    props: z
      .object({
        ...blockBase,
        dateLabel: shortText,
        date: shortText,
        venueLabel: shortText,
        venue: shortText,
        cityLabel: shortText,
        city: shortText,
      })
      .strict(),
  })
  .strict();

const scheduleBlock = z
  .object({
    type: z.literal("ScheduleBlock"),
    props: z
      .object({
        ...blockBase,
        eyebrow: shortText,
        title: shortText,
        introduction: bodyText,
        items: z
          .array(
            z
              .object({
                time: shortText,
                title: shortText,
                details: optionalText,
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
  })
  .strict();

const storyBlock = z
  .object({
    type: z.literal("StoryBlock"),
    props: z
      .object({
        ...blockBase,
        eyebrow: shortText,
        title: shortText,
        body: bodyText,
      })
      .strict(),
  })
  .strict();

const guideBlockProps = z
  .object({
    ...blockBase,
    eyebrow: shortText,
    title: shortText,
    introduction: bodyText,
    items: z
      .array(
        z
          .object({
            title: shortText,
            details: bodyText,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

const travelBlock = z.object({ type: z.literal("TravelBlock"), props: guideBlockProps }).strict();
const stayBlock = z.object({ type: z.literal("StayBlock"), props: guideBlockProps }).strict();

const faqBlock = z
  .object({
    type: z.literal("FaqBlock"),
    props: z
      .object({
        ...blockBase,
        eyebrow: shortText,
        title: shortText,
        items: z
          .array(
            z
              .object({
                question: shortText,
                answer: bodyText,
              })
              .strict(),
          )
          .max(20),
      })
      .strict(),
  })
  .strict();

const registryBlock = z
  .object({
    type: z.literal("RegistryBlock"),
    props: z
      .object({
        ...blockBase,
        eyebrow: shortText,
        title: shortText,
        body: bodyText,
        linkLabel: z.string().trim().max(120),
        linkUrl: z.union([z.literal(""), safeLink]),
      })
      .strict(),
  })
  .strict();

const photoBlock = z
  .object({
    type: z.literal("PhotoBlock"),
    props: z
      .object({
        ...blockBase,
        url: safeImageUrl,
        alt: shortText,
        caption: optionalText,
        shape: z.enum(["landscape", "portrait", "full"]),
      })
      .strict(),
  })
  .strict();

export const weddingBlockSchema = z.discriminatedUnion("type", [
  heroBlock,
  detailsBlock,
  scheduleBlock,
  storyBlock,
  travelBlock,
  stayBlock,
  faqBlock,
  registryBlock,
  photoBlock,
]);

const rootPropsSchema = z
  .object({
    id: z.literal("root").optional(),
    font: z.enum(["playful", "classic", "modern"]),
    paperTone: z.enum(["ivory", "blush", "sage"]),
    spacing: z.enum(["cozy", "airy"]),
  })
  .strict();

const puckRootReadOnlySchema = z
  .object({
    id: z.boolean().optional(),
    font: z.boolean().optional(),
    paperTone: z.boolean().optional(),
    spacing: z.boolean().optional(),
  })
  .strict();

export const weddingPageDataSchema = z
  .object({
    root: z
      .object({
        props: rootPropsSchema,
        readOnly: puckRootReadOnlySchema.optional(),
      })
      .strict(),
    content: z.array(weddingBlockSchema).min(1).max(40),
    zones: z.object({}).strict().optional(),
  })
  .strict()
  .transform(({ root, content }) => ({ root: { props: root.props }, content }))
  .superRefine((data, context) => {
    const ids = new Set<string>();
    for (const [index, block] of data.content.entries()) {
      if (ids.has(block.props.id)) {
        context.addIssue({
          code: "custom",
          message: "Every block needs a unique identifier.",
          path: ["content", index, "props", "id"],
        });
      }
      ids.add(block.props.id);
    }

    if (JSON.stringify(data).length > 128_000) {
      context.addIssue({ code: "custom", message: "The page is too large." });
    }
  });

export type WeddingPageData = z.infer<typeof weddingPageDataSchema>;
export type WeddingBlock = z.infer<typeof weddingBlockSchema>;

export const defaultWeddingPage = weddingPageDataSchema.parse({
  root: { props: { font: "playful", paperTone: "ivory", spacing: "airy" } },
  content: [
    {
      type: "HeroBlock",
      props: {
        id: "hero",
        visible: true,
        eyebrow: "Save the date",
        firstName: "Emma",
        secondName: "Eric",
        date: "September 25, 2027",
        venue: "Botanica, The Wichita Gardens",
        location: "Wichita, Kansas",
        primaryLabel: "Explore the draft",
        primaryHref: "#weekend",
      },
    },
    {
      type: "DetailsBlock",
      props: {
        id: "details",
        visible: true,
        dateLabel: "Date",
        date: "September 25, 2027",
        venueLabel: "Place",
        venue: "Botanica, The Wichita Gardens",
        cityLabel: "City",
        city: "Wichita, Kansas",
      },
    },
    {
      type: "ScheduleBlock",
      props: {
        id: "weekend",
        visible: false,
        eyebrow: "The weekend",
        title: "Meet us in the garden",
        introduction: "The confirmed ceremony, reception, and weekend schedule will be added here.",
        items: [],
      },
    },
    {
      type: "StoryBlock",
      props: {
        id: "story",
        visible: false,
        eyebrow: "Our story",
        title: "In our own words",
        body: "This is where Emma and Eric can share their story. No placeholder biography will be published.",
      },
    },
    {
      type: "TravelBlock",
      props: {
        id: "travel",
        visible: false,
        eyebrow: "Travel",
        title: "Getting to Wichita",
        introduction:
          "Confirmed transportation, parking, and local recommendations will be added here.",
        items: [],
      },
    },
    {
      type: "StayBlock",
      props: {
        id: "stay",
        visible: false,
        eyebrow: "While you’re here",
        title: "Make the most of your stay",
        introduction: "Hotel details and a few favorite Wichita places will be added here.",
        items: [],
      },
    },
    {
      type: "FaqBlock",
      props: {
        id: "faq",
        visible: false,
        eyebrow: "Good to know",
        title: "Questions, answered",
        items: [],
      },
    },
    {
      type: "RegistryBlock",
      props: {
        id: "registry",
        visible: false,
        eyebrow: "Registry",
        title: "Gifts & good wishes",
        body: "Registry information will be added only after it is confirmed.",
        linkLabel: "",
        linkUrl: "",
      },
    },
  ],
});

function isSafeLink(value: string) {
  if (value.startsWith("#") || (value.startsWith("/") && !value.startsWith("//"))) {
    return true;
  }

  return isSafeHttpsUrl(value);
}

function isSafeImageUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return true;
  }

  return isSafeHttpsUrl(value);
}

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
