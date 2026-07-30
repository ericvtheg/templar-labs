import type { EvaluationCase } from "../../types.ts";

export const developmentCases = [
  {
    id: "espresso-machine-exploratory",
    track: "clarification",
    intent: "I want a great espresso machine for home but don't know what to buy.",
    hiddenContext:
      "The user drinks two milk drinks daily, values convenience, and has a flexible budget around €1,500.",
    tags: ["exploratory", "missing-context", "consumer-goods"],
  },
  {
    id: "dual-boiler-width-limit",
    track: "research_decision",
    intent:
      "Find me the best dual-boiler espresso machine under €2,000 that is no wider than 31 cm.",
    context:
      "Delivery must be available to Stockholm, Sweden. Include total delivered price and warranty.",
    tags: ["strict-constraints", "compatibility", "price"],
  },
  {
    id: "used-sofa-stockholm",
    track: "research_decision",
    intent: "Find a comfortable used three-seat sofa around Stockholm for at most 6,000 SEK.",
    context: "It must be available for pickup this week and fit through an 80 cm doorway.",
    tags: ["used", "local", "availability"],
  },
  {
    id: "premium-antique-sofa",
    track: "research_decision",
    intent:
      "Help me buy a genuinely special antique sofa in Sweden, with a budget up to 60,000 SEK.",
    context:
      "I care more about provenance, condition, and design quality than finding the lowest price.",
    tags: ["premium", "antique", "quality"],
  },
  {
    id: "swedish-outdoor-sauna",
    track: "end_to_end",
    intent: "I need an outdoor sauna for a summer house in the Stockholm archipelago.",
    hiddenContext:
      "The site has boat-only access and no three-phase electricity. Four adults should fit comfortably.",
    tags: ["high-value", "installation", "missing-context"],
  },
  {
    id: "wedding-photographer-stockholm",
    track: "research_decision",
    intent: "Find a wedding photographer for eight hours in Stockholm around 25,000 SEK.",
    context:
      "The wedding is 12 June 2027. We prefer candid documentary photography and want full-resolution files.",
    tags: ["service", "quote-based", "availability"],
  },
  {
    id: "wedding-shuttle",
    track: "clarification",
    intent: "We need transportation for our wedding guests outside Stockholm.",
    hiddenContext:
      "There are 74 guests, two hotels, and a venue 45 minutes away. Late-night return trips matter.",
    tags: ["service", "logistics", "missing-context"],
  },
  {
    id: "stockholm-tokyo-flight",
    track: "research_decision",
    intent:
      "Find the best round-trip economy flight for one adult from Stockholm Arlanda to Tokyo, departing 10 April 2027 and returning 19 April 2027.",
    context:
      "Either Haneda or Narita is acceptable. Allow at most one stop each way, with no self-transfer. The total budget is 11,000 SEK including all mandatory fees and one checked bag. Give the exact flight numbers, schedules, connection airports, baggage allowance, current total bookable price, and a direct booking link. Prefer the shortest elapsed journey once every hard requirement is satisfied.",
    tags: ["travel", "flight", "live-inventory", "schedule", "bundle", "price"],
  },
  {
    id: "refurbished-camera-kit",
    track: "research_decision",
    intent:
      "Find the best-value refurbished full-frame camera and one travel lens under €2,200 total.",
    context:
      "It must ship to Sweden and include at least a six-month warranty. Low-light autofocus matters most.",
    tags: ["refurbished", "bundle", "quality"],
  },
  {
    id: "laptop-dock-compatibility",
    track: "research_decision",
    intent:
      "Find one dock that can run two 4K 60 Hz monitors from my M3 MacBook Air and charge it.",
    context:
      "Budget is 2,500 SEK. Avoid DisplayLink if native dual external displays are impossible on this laptop.",
    tags: ["compatibility", "technical", "risk-avoidance"],
  },
  {
    id: "impossible-compact-fridge",
    track: "clarification",
    intent:
      "Find a frost-free fridge-freezer under 45 cm wide with at least 300 litres capacity for under 4,000 SEK.",
    context: "It must be available new in Sweden this month.",
    tags: ["impossible-constraints", "strict-constraints"],
  },
  {
    id: "heat-pump-installer",
    track: "end_to_end",
    intent:
      "Help me find a good air-to-water heat pump and installer for a detached house near Uppsala.",
    hiddenContext:
      "The house is 165 m², uses radiators, consumes 24,000 kWh/year, and currently has direct electric heating.",
    tags: ["service", "installation", "high-value", "missing-context"],
  },
  {
    id: "cargo-bike-alternatives",
    track: "research_decision",
    intent:
      "Find the best way to get a reliable electric cargo bike for carrying two children in Stockholm under 45,000 SEK.",
    context:
      "Used, refurbished, subscription, and employer-benefit options are all acceptable. It will be stored outdoors.",
    tags: ["alternative-acquisition", "local", "durability"],
  },
] as const satisfies ReadonlyArray<EvaluationCase>;
