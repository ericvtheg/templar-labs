import { z } from "zod";

export const tripStartDate = "2026-07-23";
export const tripEndDate = "2026-07-30";
export const prepWindowDays = 50;
export const prepStartDate = "2026-06-03";

export const scenarioDefinitions = [
  {
    key: "family_conversation",
    label: "Family conversation",
    shortLabel: "Family",
    defaultScore: 12,
  },
  {
    key: "grandmas_birthday",
    label: "Grandma's birthday",
    shortLabel: "Birthday",
    defaultScore: 8,
  },
  {
    key: "stockholm_transit",
    label: "Stockholm transit",
    shortLabel: "Transit",
    defaultScore: 8,
  },
  {
    key: "food_and_cafes",
    label: "Food and cafes",
    shortLabel: "Cafes",
    defaultScore: 10,
  },
  {
    key: "ferry_and_day_travel",
    label: "Ferry and day travel",
    shortLabel: "Ferry",
    defaultScore: 6,
  },
  {
    key: "city_interactions",
    label: "City interactions",
    shortLabel: "City",
    defaultScore: 8,
  },
  {
    key: "listening_comprehension",
    label: "Listening comprehension",
    shortLabel: "Listening",
    defaultScore: 10,
  },
] as const;

export const scenarioKeys = scenarioDefinitions.map((scenario) => scenario.key);

export type ScenarioKey = (typeof scenarioDefinitions)[number]["key"];

export const missionDialogueLineSchema = z.object({
  speaker: z.string().min(1).max(40),
  swedish: z.string().min(1).max(180),
  english: z.string().min(1).max(220),
});

export const missionPromptSchema = z.object({
  id: z.string().min(1).max(32),
  mode: z.enum(["repeat", "answer"]),
  promptEnglish: z.string().min(1).max(160),
  expectedSwedish: z.string().min(1).max(180),
  tone: z.enum(["casual_family", "polite_public"]),
});

export const missionSchema = z.object({
  title: z.string().min(1).max(80),
  scenarioKey: z.enum(scenarioKeys as [ScenarioKey, ...ScenarioKey[]]),
  phase: z.string().min(1).max(80),
  difficulty: z.number().int().min(1).max(5),
  context: z.string().min(1).max(360),
  dialogue: z.array(missionDialogueLineSchema).min(2).max(6),
  prompts: z.array(missionPromptSchema).min(3).max(6),
  roleplaySetup: z.string().min(1).max(420),
  coachNotes: z.object({
    listenFor: z.string().min(1).max(180),
    oneCorrectionLimit: z.string().min(1).max(180),
    nextFocus: z.string().min(1).max(180),
  }),
});

export const evaluationSchema = z.object({
  understandable: z.boolean(),
  intelligibilityScore: z.number().int().min(0).max(100),
  naturalnessScore: z.number().int().min(0).max(100),
  toneAppropriate: z.boolean(),
  feedback: z.string().min(1).max(280),
  moreNaturalSwedish: z.string().min(1).max(180),
  pronunciationNote: z.string().min(1).max(180),
  memorySignal: z
    .object({
      kind: z.enum(["weakness", "strength", "mastered_phrase", "recurring_mistake"]),
      pattern: z.string().min(1).max(180),
      evidence: z.string().min(1).max(240),
      nextPractice: z.string().min(1).max(180),
    })
    .optional(),
});

export const roleplayReplySchema = z.object({
  swedish: z.string().min(1).max(220),
  englishSummary: z.string().min(1).max(220),
  shouldEnd: z.boolean(),
  coachDebrief: z
    .object({
      understandable: z.string().min(1).max(180),
      moreNatural: z.string().min(1).max(180),
      tomorrow: z.string().min(1).max(180),
    })
    .optional(),
});

export type Mission = z.output<typeof missionSchema>;
export type MissionPrompt = z.output<typeof missionPromptSchema>;
export type MissionDialogueLine = z.output<typeof missionDialogueLineSchema>;
export type MissionEvaluation = z.output<typeof evaluationSchema>;
export type RoleplayReply = z.output<typeof roleplayReplySchema>;

export type CalendarDay = {
  readonly dayNumber: number;
  readonly date: string;
  readonly label: string;
  readonly phase: string;
  readonly isToday: boolean;
  readonly isGenerated: boolean;
};

export function scenarioLabel(key: ScenarioKey): string {
  return scenarioDefinitions.find((scenario) => scenario.key === key)?.label ?? key;
}

export function phaseForDay(dayNumber: number): string {
  if (dayNumber <= 10) {
    return "Survival Swedish";
  }

  if (dayNumber <= 20) {
    return "Family Swedish";
  }

  if (dayNumber <= 30) {
    return "Stockholm Swedish";
  }

  if (dayNumber <= 40) {
    return "Conversation Expansion";
  }

  return "Simulation Mode";
}

export function scenarioForDay(dayNumber: number): ScenarioKey {
  const arcScenarios: ScenarioKey[] =
    dayNumber <= 10
      ? ["family_conversation", "listening_comprehension", "city_interactions"]
      : dayNumber <= 20
        ? ["family_conversation", "grandmas_birthday", "listening_comprehension"]
        : dayNumber <= 30
          ? ["stockholm_transit", "food_and_cafes", "city_interactions"]
          : dayNumber <= 40
            ? ["family_conversation", "food_and_cafes", "ferry_and_day_travel"]
            : [
                "grandmas_birthday",
                "family_conversation",
                "stockholm_transit",
                "food_and_cafes",
                "ferry_and_day_travel",
              ];

  return arcScenarios[(dayNumber - 1) % arcScenarios.length] ?? "family_conversation";
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function dateFromIso(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

export function missionDayForDate(date: Date): number {
  const prepStart = dateFromIso(prepStartDate);
  const diffMs = date.getTime() - prepStart.getTime();
  const rawDay = Math.floor(diffMs / 86_400_000) + 1;

  return Math.min(Math.max(rawDay, 1), prepWindowDays);
}

export function buildCalendar(today: Date, generatedDates: Set<string>): CalendarDay[] {
  const todayIso = isoDate(today);
  const start = dateFromIso(prepStartDate);

  return Array.from({ length: prepWindowDays }, (_, index) => {
    const dayNumber = index + 1;
    const date = isoDate(addDays(start, index));

    return {
      dayNumber,
      date,
      label: `Day ${dayNumber}`,
      phase: phaseForDay(dayNumber),
      isToday: date === todayIso,
      isGenerated: generatedDates.has(date),
    };
  });
}

export function fallbackMission(dayNumber: number): Mission {
  const scenarioKey = scenarioForDay(dayNumber);
  const phase = phaseForDay(dayNumber);

  if (scenarioKey === "food_and_cafes") {
    return {
      title: "Order coffee without switching too fast",
      scenarioKey,
      phase,
      difficulty: 2,
      context:
        "You are in a Stockholm cafe. The goal is polite, simple Swedish that still works if the barista answers naturally.",
      dialogue: [
        {
          speaker: "Barista",
          swedish: "Hej! Vad vill du ha?",
          english: "Hi! What would you like?",
        },
        {
          speaker: "Eric",
          swedish: "Jag skulle vilja ha en kaffe, tack.",
          english: "I would like a coffee, please.",
        },
        {
          speaker: "Barista",
          swedish: "Vill du ha nagot mer?",
          english: "Would you like anything else?",
        },
        {
          speaker: "Eric",
          swedish: "Nej tack, det ar bra.",
          english: "No thanks, that's good.",
        },
      ],
      prompts: [
        {
          id: "p1",
          mode: "repeat",
          promptEnglish: "Say: I would like a coffee, please.",
          expectedSwedish: "Jag skulle vilja ha en kaffe, tack.",
          tone: "polite_public",
        },
        {
          id: "p2",
          mode: "answer",
          promptEnglish: "Say that you do not want anything else.",
          expectedSwedish: "Nej tack, det ar bra.",
          tone: "polite_public",
        },
        {
          id: "p3",
          mode: "answer",
          promptEnglish: "Ask if they speak English.",
          expectedSwedish: "Pratar du engelska?",
          tone: "polite_public",
        },
      ],
      roleplaySetup:
        "The AI plays a patient but realistic Stockholm barista. Stay mostly in Swedish, ask one follow-up question, and do not teach until the debrief.",
      coachNotes: {
        listenFor: "Jag skulle vilja ha...",
        oneCorrectionLimit: "Keep the ordering phrase polite and short.",
        nextFocus: "Recovering when the barista asks a follow-up question.",
      },
    };
  }

  return {
    title: "Arrive at dinner and answer naturally",
    scenarioKey,
    phase,
    difficulty: 1,
    context:
      "You are arriving for a family dinner in Stockholm. Keep it warm, short, and understandable.",
    dialogue: [
      {
        speaker: "Relative",
        swedish: "Hur var resan hit?",
        english: "How was the trip here?",
      },
      {
        speaker: "Eric",
        swedish: "Den var bra, men jag ar lite trott.",
        english: "It was good, but I'm a little tired.",
      },
      {
        speaker: "Relative",
        swedish: "Vad roligt att du ar har.",
        english: "We're so happy you're here.",
      },
      {
        speaker: "Eric",
        swedish: "Tack, det ar sa kul att traffa er.",
        english: "Thanks, it's so nice to see you all.",
      },
    ],
    prompts: [
      {
        id: "p1",
        mode: "repeat",
        promptEnglish: "Say that the trip was good.",
        expectedSwedish: "Resan var bra.",
        tone: "casual_family",
      },
      {
        id: "p2",
        mode: "answer",
        promptEnglish: "Say that you are a little tired.",
        expectedSwedish: "Jag ar lite trott.",
        tone: "casual_family",
      },
      {
        id: "p3",
        mode: "answer",
        promptEnglish: "Say that it is nice to see everyone.",
        expectedSwedish: "Det ar sa kul att traffa er.",
        tone: "casual_family",
      },
      {
        id: "p4",
        mode: "answer",
        promptEnglish: "Ask how they are doing.",
        expectedSwedish: "Hur mar ni?",
        tone: "casual_family",
      },
    ],
    roleplaySetup:
      "The AI plays a Swedish-speaking relative at dinner. Start simple, ask one follow-up question, and preserve the conversation until the debrief.",
    coachNotes: {
      listenFor: "Hur var resan hit?",
      oneCorrectionLimit: "Prioritize understandable short answers over perfect grammar.",
      nextFocus: "Short answers about plans using ska.",
    },
  };
}
