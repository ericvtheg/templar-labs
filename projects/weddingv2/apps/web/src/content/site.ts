// Every word on the site lives here. All three design versions read from this file.
//
// Source of truth: Emma's Canva design (projects/weddingv2/reference). The text is
// transcribed exactly, except for these typo fixes:
//   - Letter: "Wichita, Kansas on to celebrate" -> "Wichita, Kansas to celebrate"
//   - Travel: "plently of options" -> "plenty of options"
//   - Things to Do: "where you can find grab a coffee" -> "where you can grab a coffee"
//   - FAQ: "options everyday" -> "options every day"

export type Venue = {
  name: string;
  address: string;
  mapUrl: string;
};

export type ScheduleEvent = {
  id: string;
  /** Script line above an event, for example "If you’re in town...". */
  lead?: string;
  day: string;
  name: string;
  time?: string;
  /** The same times as single moments, for versions that draw a timeline. */
  moments?: readonly { id: string; time: string }[];
  /** Short lines shown under the time. */
  notes: readonly string[];
  /** A longer paragraph, used when the details are not final. */
  details?: string;
  venue: Venue;
  /** False hides the venue until the couple is ready to share it. */
  venueAnnounced: boolean;
  venueNote?: string;
  /** False keeps the event off the site (for example the rehearsal dinner). */
  guestFacing: boolean;
};

export type Hotel = {
  id: string;
  name: readonly string[];
  address: string;
  mapUrl: string;
  notes: readonly string[];
  /** Null shows a placeholder button until the room-block link exists. */
  bookingUrl: string | null;
};

function mapUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export const couple = {
  first: "Emma",
  second: "Eric",
  fullNames: "Emma Starks & Eric Ventor",
  date: "September 25, 2027",
  dateIso: "2027-09-25",
  place: "Wichita, Kansas",
} as const;

export const home = {
  tagline: "Meet us in Kansas?",
  letter: {
    greeting: "Dear family and friends,",
    lines: [
      "We would be delighted for you to join us in",
      "Wichita, Kansas to celebrate our marriage together.",
    ],
  },
} as const;

const botanica: Venue = {
  name: "Botanica, The Wichita Gardens",
  address: "701 Amidon St, Wichita, KS 67203",
  mapUrl: mapUrl("Botanica, The Wichita Gardens, 701 Amidon St, Wichita, KS 67203"),
};

// Eric confirmed the welcome party and rehearsal dinner are at Elderslie. The exact
// name and address below come from a web search and still need his confirmation.
const elderslie: Venue = {
  name: "Elderslie Farm",
  address: "3501 E 101st St N, Valley Center, KS 67147",
  mapUrl: mapUrl("Elderslie Farm, 3501 E 101st St N, Valley Center, KS 67147"),
};

export const schedule = {
  title: "The Schedule",
  events: [
    {
      id: "wedding",
      day: "Saturday, September 25",
      name: "The Wedding",
      time: "5:00 PM - 10:30 PM",
      moments: [
        { id: "seated", time: "4:45 PM" },
        { id: "start", time: "5:00 PM" },
        { id: "end", time: "10:30 PM" },
      ],
      notes: ["Please plan to arrive and be seated by 4:45 PM."],
      venue: botanica,
      venueAnnounced: true,
      venueNote: "If you choose to drive, there is a large parking lot",
      guestFacing: true,
    },
    {
      id: "welcome-party",
      lead: "If you’re in town...",
      day: "Friday, September 24",
      name: "Welcome Party",
      notes: [],
      details:
        "We’ll have more information about where and when closer to the date but if you are in town Friday evening, we’ll be planning a welcome party to say hi before the big day!",
      venue: elderslie,
      venueAnnounced: false,
      guestFacing: true,
    },
    {
      id: "rehearsal-dinner",
      day: "Friday, September 24",
      name: "Rehearsal Dinner",
      notes: [],
      venue: elderslie,
      venueAnnounced: false,
      guestFacing: false,
    },
  ],
} as const satisfies { title: string; events: readonly ScheduleEvent[] };

/** The events guests see, in the order the Canva design lists them. */
export const guestEvents: readonly ScheduleEvent[] = schedule.events.filter(
  (event) => event.guestFacing,
);

export const travel = {
  title: "Travel",
  sections: [
    {
      label: "Flight",
      lines: [
        "Fly into Wichita Dwight D. Eisenhower National Airport - ICT.",
        "The airport is just 10 minutes away from Downtown Wichita. There are no direct flights from California but plenty of options daily with layovers.",
      ],
    },
    {
      label: "Getting around",
      lines: [
        "Wichita is easiest to get around with a car. But, depending on where you stay, it is possible to do the weekend without a rental car.",
      ],
    },
    {
      label: null,
      lines: [
        "Uber and Lyft are available, although there are fewer drivers than you may be used to in Los Angeles. If you plan to use rideshare for the wedding, we recommend scheduling your ride ahead of time and allowing extra time.",
      ],
    },
    {
      label: null,
      lines: [
        "If you stay in a hotel downtown, there are plenty of food, coffee shops & bars within walking distance. Some hotels even offer a free airport shuttle if you contact them ahead of time.",
      ],
    },
  ],
} as const;

export const stay = {
  title: "Travel",
  intro: [
    "Here are three hotel options we have reserved room blocks at.",
    "Click the button to book a room at the group rate.",
  ],
  bookLabel: "Book a room",
  bookPendingNote: "Booking link coming soon",
  hotels: [
    {
      id: "hotel-at-old-town",
      name: ["Hotel At Old Town"],
      address: "830 E 1st St N, Wichita, KS 67202",
      mapUrl: mapUrl("Hotel At Old Town, 830 E 1st St N, Wichita, KS 67202"),
      notes: [
        "10 minute car ride to wedding venue",
        "Tons of food and bar options in walking distance",
      ],
      bookingUrl: null,
    },
    {
      id: "ambassador-hotel",
      name: ["Ambassador Hotel Wichita,", "Autograph Collection"],
      address: "104 S Broadway, Wichita, KS 67202",
      mapUrl: mapUrl("Ambassador Hotel Wichita, 104 S Broadway, Wichita, KS 67202"),
      notes: [
        "10 minute car ride to wedding venue",
        "Food & coffee options within walking distance",
        "Offers a free shuttle for a 5 mile radius",
      ],
      bookingUrl: null,
    },
    {
      id: "hilton-garden-inn",
      name: ["Hilton Garden Inn"],
      address: "401 E Douglas Ave, Wichita, KS 67202",
      mapUrl: mapUrl("Hilton Garden Inn, 401 E Douglas Ave, Wichita, KS 67202"),
      notes: ["8 minute drive to wedding venue", "Some food and coffee within walking distance"],
      bookingUrl: null,
    },
  ],
} as const satisfies {
  title: string;
  intro: readonly string[];
  bookLabel: string;
  bookPendingNote: string;
  hotels: readonly Hotel[];
};

export const thingsToDo = {
  title: "Things to Do",
  activities: [
    {
      id: "dead-center-vintage",
      title: "Shop at Dead Center Vintage",
      text: "Thrifting in the Midwest is the best! Our matron of honor, Kenzie, and our officiant, Laz, have owned this store for seven years. Stop by and check out their amazing collection!",
    },
    {
      id: "chisholm-creek-park",
      title: "Go for a walk at Chisholm Creek Park",
      text: "Explore the trails, enjoy some Kansas nature, and keep an eye out for the local wildlife. You might even spot a few deer!",
    },
    {
      id: "watermark-books",
      title: "Shop at Watermark Books",
      text: "A cozy independent bookstore where you can grab a coffee, and wander around for a bit.",
    },
    {
      id: "cowtown",
      title: "Visit Cowtown",
      text: "Experience what life was like in Wichita during the 1800s at this living history museum.",
    },
  ],
  food: [
    { id: "breakfast", label: "Breakfast & brunch spots", places: ["HomeGrown", "Doo-Dah Diner"] },
    {
      id: "casual",
      label: "Casual eats & local favorites",
      places: ["NuWay", "Larcher’s Market", "Tommy’s"],
    },
    {
      id: "dinner",
      label: "Dinner & drinks",
      places: ["Lotte", "The Belmont", "Prost", "Public at the Brickyard"],
    },
  ],
} as const;

export const faq = {
  title: "Frequently Asked Questions",
  shortTitle: "FAQ",
  items: [
    {
      id: "indoor-or-outdoors",
      question: "Is the wedding indoor or outdoors?",
      answer:
        "The ceremony, cocktail hour, and dancing will be outdoors, while dinner will be held indoors. In the event of bad weather, we’ll move everything indoors. The ceremony will be on grass so plan your shoes accordingly!",
    },
    {
      id: "weather",
      question: "What is the weather like in Kansas?",
      answer:
        "Late September in Wichita is usually lovely, with daytime highs around 80°F (27°C) and evening temperatures dropping to around 65°F (18°C). We recommend bringing a light jacket if you get cold at night. Kansas weather can be very unpredictable, so make sure to check the forecast that weekend!",
    },
    {
      id: "dress-code",
      question: "What is the dress code?",
      answer:
        "Cocktail/Semi-Formal. Dresses, midi, maxi or mini, jumpsuits, suits, dress pants, button-downs, and dress shoes are all great options. Please no jeans!",
    },
    {
      id: "kids",
      question: "Are kids allowed?",
      answer:
        "No! We are only allowing immediate family to bring their children in order to accommodate the size of the venue.",
    },
    {
      id: "plus-ones",
      question: "Are plus ones allowed?",
      answer:
        "If you have a plus one, they will be listed on your invitation or you’ll have the option to fill in their name.",
    },
    {
      id: "open-bar",
      question: "Is there an open bar?",
      answer: "Hell yeah! There will be an open bar with beer, wine and cocktail options.",
    },
    {
      id: "gifts",
      question: "Who should I address gifts to?",
      answer:
        "Emma will not be changing her last name so you can address any gifts to Emma Starks & Eric Ventor, thank you!",
    },
    {
      id: "getting-to-wichita",
      question: "How do I get to Wichita, Kansas?",
      answer:
        "Wichita has its own airport - Wichita Dwight D. Eisenhower National Airport - ICT. The airport is just 10 minutes away from Downtown Wichita. There are no direct flights from California to Wichita but plenty of options every day that have layovers.",
    },
  ],
} as const;

export type Activity = (typeof thingsToDo.activities)[number];
export type FaqItem = (typeof faq.items)[number];
