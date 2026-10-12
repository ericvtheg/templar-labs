// Every word on the current site lives here. Versions 6 to 9 read from this file.
//
// Source of truth: Emma's third and fourth Canva exports
// (projects/weddingv2/reference/round-3 and round-4).
// The text is transcribed exactly, except for these typo fixes:
//   - Letter: "accomadation" -> "accommodation"
//   - Things to Do: "where you can find grab a coffee" -> "where you can grab a coffee"
//   - FAQ: "options everyday" -> "options every day"
//
// Round four gave each thing to do a photo. Her page for the Cowtown photo
// repeats the Watermark Books title and text, so that photo is used with the
// Cowtown entry here.
//
// Versions 1 to 5 are earlier rounds. They keep the text they were designed
// around, in site-round-2.ts.

export type Venue = {
  name: string;
  address: string;
  mapUrl: string;
};

export type ScheduleEvent = {
  id: string;
  day: string;
  name: string;
  time?: string;
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
    paragraphs: [
      "We would be delighted for you to join us in Wichita, Kansas to celebrate our marriage together.",
      "Here you can find travel and accommodation information but reach out to us if you have any questions about getting to Kansas!",
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
  // In date order, as Emma's design now has them.
  events: [
    {
      id: "welcome-party",
      day: "Friday, September 24",
      name: "Welcome Party",
      notes: [],
      details:
        "We’ll have more information about where and when closer to the date. No pressure to attend but if you are in town Friday evening, we’ll be planning a welcome party to say hi before the big day!",
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
    {
      id: "wedding",
      day: "Saturday, September 25",
      name: "The Wedding",
      time: "5:00 PM - 10:30 PM",
      notes: ["Please plan to arrive and be seated by 4:45 PM."],
      venue: botanica,
      venueAnnounced: true,
      venueNote: "If you choose to drive, there is a large parking lot",
      guestFacing: true,
    },
  ],
} as const satisfies { title: string; events: readonly ScheduleEvent[] };

/** The events guests see, in date order. */
export const guestEvents: readonly ScheduleEvent[] = schedule.events.filter(
  (event) => event.guestFacing,
);

export const travel = {
  title: "Travel",
  sections: [
    {
      id: "flight",
      label: "Flight",
      paragraphs: [
        "Fly into Wichita Dwight D. Eisenhower National Airport - ICT.",
        "The airport is just 10 minutes away from Downtown Wichita. There are no direct flights from California but plenty of options daily with layovers.",
      ],
    },
    {
      id: "getting-around",
      label: "Getting around",
      paragraphs: [
        "Wichita is easiest to get around with a car. But, depending on where you stay, it is possible to do the weekend without a rental car.",
        "Uber and Lyft are available, although there are fewer drivers than you may be used to in Los Angeles. If you plan to use rideshare for the wedding, we recommend scheduling your ride ahead of time and allowing extra time.",
        "If you stay at any of the hotels below, there are plenty of food, coffee shops & bars within walking distance.",
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
      text: "Thrifting in the Midwest is the best! Emma’s matron of honor, Kenzie, and our officiant, Laz, have owned this store for seven years. Stop by and check out their amazing collection!",
      photo: {
        file: "dead-center-vintage.jpg",
        alt: "Racks of colorful vintage clothes inside Dead Center Vintage.",
        ofUs: false,
      },
    },
    {
      id: "chisholm-creek-park",
      title: "Go for a walk at Chisholm Creek Park",
      text: "Explore the trails, enjoy some Kansas nature, and keep an eye out for the local wildlife. You might even spot a few deer!",
      photo: {
        file: "chisholm-creek-park.jpg",
        alt: "A pink sunset over a wide green field at Chisholm Creek Park.",
        ofUs: false,
      },
    },
    {
      id: "watermark-books",
      title: "Shop at Watermark Books",
      text: "A cozy independent bookstore where you can grab a coffee, and wander around for a bit.",
      photo: {
        file: "watermark-books.jpg",
        alt: "The green storefront of Watermark Books & Café, with tables outside.",
        ofUs: false,
      },
    },
    {
      id: "cowtown",
      title: "Visit Cowtown",
      text: "Experience what life was like in Wichita during the 1800s at this living history museum.",
      photo: {
        file: "cowtown.jpg",
        alt: "Emma and Eric at Cowtown at night, smiling beside people dressed in 1800s costume.",
        // Emma and Eric are in this one. It shows only in versions with photos of them.
        ofUs: true,
      },
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
  // Each answer is a list of paragraphs.
  items: [
    {
      id: "indoor-or-outdoors",
      question: "Is the wedding indoor or outdoors?",
      answer: [
        "The ceremony, cocktail hour, and dancing will be outdoors, while dinner will be held indoors. In the event of bad weather, we’ll move everything indoors. The ceremony will be on grass so plan your shoes accordingly!",
      ],
    },
    {
      id: "weather",
      question: "What is the weather like in Kansas?",
      answer: [
        "Late September in Wichita is usually lovely, with daytime highs around 80°F (27°C) and evening temperatures dropping to around 65°F (18°C). We recommend bringing a light jacket if you get cold at night. Kansas weather can be very unpredictable, so make sure to check the forecast that weekend!",
      ],
    },
    {
      id: "dress-code",
      question: "What is the dress code?",
      answer: [
        "Cocktail/Semi-Formal. Dresses, midi, maxi or mini, jumpsuits, suits, dress pants, button-downs, and dress shoes are all great options. Please no jeans!",
      ],
    },
    {
      id: "kids",
      question: "Are kids allowed?",
      answer: [
        "No! We are only allowing immediate family to bring their children in order to accommodate the size of the venue.",
      ],
    },
    {
      id: "plus-ones",
      question: "Are plus ones allowed?",
      answer: [
        "If you have a plus one, they will be listed on your invitation or you’ll have the option to fill in their name.",
      ],
    },
    {
      id: "open-bar",
      question: "Is there an open bar?",
      answer: ["Hell yeah! There will be an open bar with beer, wine and cocktail options."],
    },
    {
      id: "getting-to-wichita",
      question: "How do I get to Wichita, Kansas?",
      answer: [
        "Wichita has its own airport - Wichita Dwight D. Eisenhower National Airport - ICT. The airport is just 10 minutes away from Downtown Wichita. There are no direct flights from California to Wichita but plenty of options every day that have layovers.",
      ],
    },
    {
      id: "what-is-wichita-like",
      question: "What is Wichita like? Is this going to be in the middle of nowhere?",
      answer: [
        "No you little freak! Wichita has its own downtown, restaurants, coffee shops, breweries, museums, shopping, parks and nightlife. You definitely won’t be in the middle of nowhere but you’ll still get the chance to see the beautiful Great Plains if you drive around town.",
      ],
    },
    {
      id: "rental-car",
      question: "Do I need a rental car in Wichita?",
      answer: [
        "It’s up to you! You can definitely navigate Wichita without a car but allow extra time for requesting Ubers or Lyfts. There are Ubers in Wichita but definitely not as many as a city like Los Angeles. So if you plan to Uber to the wedding venue, just make sure you arrive extra early.",
        "Some downtown hotels offer a free airport shuttle if you contact them ahead of time. And if you stay downtown, although the streets aren’t bustling, there are walkable food and coffee options in the area.",
      ],
    },
  ],
} as const;

export type Activity = (typeof thingsToDo.activities)[number];
export type FaqItem = (typeof faq.items)[number];
