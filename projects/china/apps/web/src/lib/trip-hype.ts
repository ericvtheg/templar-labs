export type TripHype = {
  tag: string;
  metric: string;
  title: string;
  fact: string;
  why: string;
  tryIt: string;
  source: { label: string; url: string };
  caveat?: string;
  extraSource?: { label: string; url: string };
};
const wall: TripHype = {
  tag: "HISTORY THAT DOESN’T FIT IN YOUR HEAD",
  metric: "20,000+ KM",
  title: "This is not a wall. It’s a civilization-scale undertaking.",
  fact: "UNESCO describes a defensive network over 20,000 km—more than 12,400 miles—built and rebuilt from the 3rd century BCE to the 17th century CE. Construction continued through the Ming dynasty (1368–1644).",
  why: "You’re not looking at it in a textbook. You’re climbing into those mountain ridgelines with the boys. Jarrell’s calves are about to meet several centuries of ambition.",
  tryIt:
    "Stop at a safe viewpoint. Put the phone away for one minute and actually take in where you are.",
  source: { label: "UNESCO · The Great Wall", url: "https://whc.unesco.org/en/list/438/" },
  caveat:
    "Total historic network, not one continuous intact wall. Surviving sections differ in age and condition.",
};
const tower: TripHype = {
  tag: "THE FUTURE HAS A SKYLINE",
  metric: "632 M",
  title: "Shanghai doesn’t do subtle.",
  fact: "Shanghai Tower rises 632 meters—about 2,073 feet—in Lujiazui. Across the Huangpu River, the Bund gives you the old-city/new-city contrast in one view.",
  why: "Ancient imperial Beijing, then this. Two cities that make the same trip feel like time travel. This is a considerably better backdrop than another hotel parking lot bachelor weekend.",
  tryIt:
    "Make a Bund riverfront walk part of a Shanghai evening; treat a tower visit as a separately priced option.",
  source: {
    label: "Shanghai government · Shanghai Tower",
    url: "https://english.shanghai.gov.cn/en-ScenicSpots/20240507/f3ce9cade30f4ff2a0bad6293626a232.html",
  },
};
const breakfast: TripHype = {
  tag: "THE LITTLE PURCHASES HIT DIFFERENT",
  metric: "¥5–15",
  title: "Breakfast can be an experience—not a $28 apology.",
  fact: "A June 2026 City News Service visit to Xiao Tao Yuan reported dishes usually around ¥5–15, including ¥5 savory soy milk. That’s a specific local breakfast example, not a promise that all of Shanghai is cheap.",
  why: "Rice rolls, fried dough, pancakes, steamers of dumplings. The morning-after food mission deserves its own fucking itinerary.",
  tryIt:
    "Try a neighborhood breakfast spot. Ask the price, look at the menu, and order one unfamiliar thing to share.",
  source: {
    label: "City News Service · Xiao Tao Yuan, June 26, 2026",
    url: "https://www.citynewsservice.cn/articles/cns/fb/new-eats/cheap-eats-one-of-shanghais-favorite-breakfast-chains-xiao-tao-yuan-pk8v0gjn",
  },
  caveat:
    "Reported prices, not live quotes. Location, extras, hours, and prices can change. No exchange-rate assumptions.",
};
const duck: TripHype = {
  tag: "DINNER WITH A BACKSTORY",
  metric: "SINCE 1864",
  title: "The duck has been famous longer than your country’s fast-food chains.",
  fact: "Beijing’s Quanjude roast-duck restaurant was established in 1864. Peking duck isn’t just a menu item here—it’s a whole culinary institution.",
  why: "A proper duck dinner with the entire crew is the kind of night you’ll bring up for years. Crispy skin, a crowded table, and somebody finally using their Mandarin instead of pointing like a drunk auctioneer.",
  tryIt:
    "Put a roast-duck dinner on the shortlist. Confirm a reservation and the full menu price for your actual group size.",
  source: {
    label: "Beijing government · Quanjude Roast Duck",
    url: "https://english.beijing.gov.cn/livinginbeijing/beijingtimehonoredbrands/202006/t20200616_1925645.html",
  },
};
const dumplings: TripHype = {
  tag: "A VERY GOOD REASON TO LEARN ‘I WANT THIS’",
  metric: "SOUP. INSIDE.",
  title: "Shanghai’s dumplings are tiny engineering projects.",
  fact: "Xiaolongbao are steamed dumplings filled with hot savory broth. Shanghai’s shengjian are pan-fried pork buns with a crisp base and juicy interior—a different, equally worthwhile target.",
  why: "The boys can have a dumpling argument instead of another argument about where to eat. Both sides win. The roof of your mouth would appreciate a little patience.",
  tryIt:
    "Try both steamed xiaolongbao and pan-fried shengjian. Let them cool a little; the broth can be hot.",
  source: {
    label: "Shanghai government · Pan-fried pork buns",
    url: "https://english.shanghai.gov.cn/en-GlobalTasteinShanghai2026-LocalFlavors/20260430/c012ba9f05414f3184be86244a03e950.html",
  },
  extraSource: {
    label: "Shanghai government · Xiaolongbao",
    url: "https://english.shanghai.gov.cn/en-GlobalTasteinShanghai2026-LocalFlavors/20260316/00b0c6d1698d406c8d532a6e169e1a1e.html",
  },
};
const subway: TripHype = {
  tag: "SAVE THE MONEY FOR THE MEMORIES",
  metric: "FROM ¥3",
  title: "Moving around doesn’t have to consume the fun budget.",
  fact: "Beijing’s published regular subway fare starts at ¥3 for journeys up to 6 km, then increases with distance. The airport express lines are excluded from that fare rule.",
  why: "Learning to recognize 地铁, 入口, and 出口 buys you actual freedom. Less burning money on confused detours, more spending it on the meal or experience you came for.",
  tryIt:
    "Find one easy subway journey together before trying to shepherd the full crew across town.",
  source: {
    label: "Beijing government · Subway fares, April 2025",
    url: "https://english.beijing.gov.cn/specials/beijinglifeonthesubway/noticeforpassengers/202504/t20250423_4072294.html",
  },
  caveat:
    "Published base fare, not a flat fare for every trip. Check current routes and prices before traveling.",
};
const palace: TripHype = {
  tag: "YOU’RE WALKING INTO THE OLD CENTER OF POWER",
  metric: "1406–1420",
  title: "The Forbidden City took fourteen years to build.",
  fact: "UNESCO records its construction between 1406 and 1420. The palace witnessed the enthronement of 14 Ming and 10 Qing emperors—24 in all.",
  why: "This isn’t a fake themed village. The scale, courtyards, roofs, and sheer ‘holy shit, people ruled from here’ factor are the attraction. Brent is still not allowed past the barrier.",
  tryIt:
    "Plan ahead for tickets and bring the required ID. Leave time to look up, not just follow a camera through the gates.",
  source: {
    label: "UNESCO · Imperial Palaces, periodic report",
    url: "https://whc.unesco.org/document/216750",
  },
};
const train: TripHype = {
  tag: "EVEN THE TRANSFER IS PART OF THE TRIP",
  metric: "350 KM/H",
  title: "Your next city arrives at bullet-train speed.",
  fact: "Fuxing services on the Beijing–Shanghai high-speed railway operate at up to 350 km/h—about 217 mph. The line links the imperial-capital part of the trip with the Shanghai skyline chapter.",
  why: "A window seat, snacks, the landscape moving like that, and the whole crew on one train. That is a travel day worth remembering—not just an airport purgatory montage.",
  tryIt:
    "Book the correct stations and departure together. Arrive early enough for security and ticket checks.",
  source: {
    label: "Xinhua · Beijing–Shanghai services at 350 km/h",
    url: "http://www.xinhuanet.com/english/2017-09/21/c_136626740.htm",
  },
  caveat:
    "Maximum operating speed, not an average or a promise for every service. Journey time and ticket prices vary.",
};
const night: TripHype = {
  tag: "THE CITY ISN’T DONE WHEN THE MUSEUM CLOSES",
  metric: "AFTER DARK",
  title: "Ancient Beijing by day. A completely different city at night.",
  fact: "Beijing’s official nighttime highlights include Sanlitun-area destinations. Shanghai’s Huangpu nightlife guide highlights the Bund Fengjing market and surrounding night-out districts.",
  why: "Big dinner, bright streets, skyline walks, bars if you want them. No one has to turn into a medical incident for the night to be legendary.",
  tryIt:
    "Pick a district, a meeting point, and a way home before the first round. Check venues and event schedules rather than assuming a market runs every night.",
  source: {
    label: "Beijing government · Nighttime highlights, December 2025",
    url: "https://english.beijing.gov.cn/latest/news/202512/t20251207_4325893.html",
  },
  extraSource: {
    label: "Shanghai government · Huangpu nightlife",
    url: "https://english.shanghai.gov.cn/en-Nightlife/20240508/fa49462a0a31470eb2b54dc7d6d70466.html",
  },
};
const nightlife: TripHype = {
  tag: "DINNER DOES NOT HAVE TO BE THE FINALE",
  metric: "ONE MORE CHAPTER",
  title: "Make an evening out of the city, not just the bar tab.",
  fact: "Shanghai’s official Huangpu nightlife guide points visitors toward the Bund Fengjing weekend market and the district’s major shopping and nightlife areas.",
  why: "Riverfront lights, a food detour, then a private KTV room if the crew is up for it. Eric gets a microphone. The rest of you get a lifelong collection of blackmail-grade memories—kept in the group chat, obviously.",
  tryIt:
    "Treat KTV as an optional plan: confirm room time, fees, minimum spend, and song availability before paying.",
  source: {
    label: "Shanghai government · Huangpu nightlife",
    url: "https://english.shanghai.gov.cn/en-Nightlife/20240508/fa49462a0a31470eb2b54dc7d6d70466.html",
  },
  caveat:
    "Experience suggestions, not booked events or guaranteed opening hours. Get permission before sharing anyone’s photos or recordings.",
};
const temple: TripHype = {
  tag: "LEAVE ROOM FOR THE UNPLANNED MOMENT",
  metric: "273 HECTARES",
  title: "Not every epic memory requires a big night out.",
  fact: "Beijing’s Temple of Heaven grounds cover 273 hectares—about 675 acres. Ming and Qing emperors used the site for ceremonies praying for good harvests.",
  why: "The quiet walk after a ridiculous night can be as good as the night itself. Give yourselves time for parks, neighborhoods, breakfast, and a conversation you’ll actually remember.",
  tryIt:
    "Keep an unhurried morning in the plan. A great bachelor trip includes making it to tomorrow’s experiences together.",
  source: {
    label: "Beijing government · Temple of Heaven",
    url: "https://english.beijing.gov.cn/specials/parktours/guidevisitors/templeofheaven/index.html",
  },
};
export function hypeFor(missionId: string): TripHype[] {
  const mapping: Record<string, TripHype[]> = {
    basics: [tower],
    arrival: [subway],
    groom: [breakfast],
    wall: [wall],
    feast: [duck, dumplings],
    payment: [breakfast, subway],
    market: [
      {
        tag: "CULTURE, NOT A COMBAT SPORT",
        metric: "ASK. AGREE. PAY.",
        title: "A good deal should work for both people.",
        fact: "Bargaining can be part of market shopping, but fixed-price supermarkets and stores are different. Don’t assume every price in China is negotiable—or every seller is trying to scam you.",
        why: "Being able to ask the price, understand the unit, and make a friendly offer turns shopping into an actual conversation. Carlo can retire from bidding against himself.",
        tryIt:
          "Compare prices, inspect the actual item, confirm the total in yuan, and keep the receipt. Decline unsolicited outings politely; choose your own venue and agree service prices first. Verify QR destinations, recipient names, and amounts before paying.",
        source: {
          label: "TravelChinaGuide · Bargaining and fixed-price exceptions",
          url: "https://www.travelchinaguide.com/essential/bargaining.htm",
        },
        extraSource: {
          label: "UK travel advice · Tourist scams and QR-code caution",
          url: "https://www.gov.uk/foreign-travel-advice/china/safety-and-security",
        },
        caveat:
          "No guaranteed discount percentages or ‘correct’ market price. Counteroffer amounts in this lesson are language examples, not valuations. If threatened, prioritize safety and seek help rather than arguing over the deal.",
      },
    ],
    palace: [palace],
    train: [train],
    night: [night, tower],
    ktv: [nightlife],
    rescue: [temple],
  };
  return mapping[missionId] ?? [];
}
