import { createServerFn } from "@tanstack/react-start";
import { makeAI } from "@templar/ai";
import { and, desc, eq, makeDatabase } from "@templar/db";
import { Effect } from "effect";
import { z } from "zod";
import * as schema from "../../../../db/schema.ts";
import {
  attempts,
  memoryItems,
  missions,
  roleplayTurns,
  scenarioReadiness,
  userProfiles,
} from "../../../../db/schema.ts";
import { templarBindings } from "../../../../templar-bindings.ts";
import { requireCurrentUser } from "./auth.server.ts";
import { userHasPremiumAccess } from "./payments.server.ts";
import {
  buildCalendar,
  evaluationSchema,
  fallbackMission,
  isoDate,
  type Mission,
  type MissionEvaluation,
  missionDayForDate,
  missionSchema,
  type RoleplayReply,
  roleplayReplySchema,
  type ScenarioKey,
  scenarioDefinitions,
  scenarioForDay,
  scenarioLabel,
  tripStartDate,
} from "./swedish-fifty.ts";
import { voiceModelRoutes } from "./voice-models.ts";

type SwedishFiftyDatabase = ReturnType<typeof makeDatabase<typeof schema>>;

type MissionRow = typeof missions.$inferSelect;
type AttemptRow = typeof attempts.$inferSelect;
type RoleplayTurnRow = typeof roleplayTurns.$inferSelect;
type MemoryItemRow = typeof memoryItems.$inferSelect;
type ReadinessRow = typeof scenarioReadiness.$inferSelect;
type UserProfileRow = typeof userProfiles.$inferSelect;

type MissionView = Mission & {
  readonly id: string;
  readonly dayNumber: number;
  readonly missionDate: string;
  readonly generatedBy: string;
  readonly model: string | null;
};

type AttemptView = {
  readonly id: string;
  readonly promptId: string;
  readonly promptText: string;
  readonly transcript: string;
  readonly evaluation: MissionEvaluation;
  readonly intelligibilityScore: number;
  readonly createdAt: string;
};

type RoleplayTurnView = {
  readonly id: string;
  readonly speaker: "learner" | "roleplay";
  readonly content: string;
  readonly englishSummary: string | null;
  readonly model: string | null;
  readonly createdAt: string;
};

type MemoryItemView = {
  readonly id: string;
  readonly kind: "weakness" | "strength" | "mastered_phrase" | "recurring_mistake";
  readonly scenarioKey: ScenarioKey;
  readonly scenarioLabel: string;
  readonly pattern: string;
  readonly evidence: string;
  readonly nextPractice: string;
};

type ReadinessView = {
  readonly scenarioKey: ScenarioKey;
  readonly label: string;
  readonly shortLabel: string;
  readonly score: number;
  readonly confidenceLabel: string;
  readonly evidenceSummary: string;
};

type AccessView = {
  readonly signedIn: true;
  readonly premium: boolean;
  readonly freeMissionAvailable: boolean;
  readonly freeMissionUsed: boolean;
  readonly canGenerateToday: boolean;
  readonly gateReason: "premium" | "free-mission" | "free-used";
};

type DashboardView = {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly access: AccessView;
  readonly today: {
    readonly isoDate: string;
    readonly dayNumber: number;
    readonly daysUntilTrip: number;
  };
  readonly calendar: ReturnType<typeof buildCalendar>;
  readonly mission: MissionView | null;
  readonly attempts: readonly AttemptView[];
  readonly roleplayTurns: readonly RoleplayTurnView[];
  readonly memories: readonly MemoryItemView[];
  readonly readiness: readonly ReadinessView[];
};

const evaluateAnswerInput = z.object({
  missionId: z.string().min(1),
  promptId: z.string().min(1),
  transcript: z.string().trim().min(1).max(500),
  voiceMetadata: z
    .object({
      provider: z.string().optional(),
      modelId: z.string().optional(),
      confidence: z.number().optional(),
    })
    .default({}),
});

const roleplayInput = z.object({
  missionId: z.string().min(1),
  learnerMessage: z.string().trim().min(1).max(500),
});

const speechInput = z.object({
  text: z.string().trim().min(1).max(800),
  route: z.enum(["quality", "fast", "balanced"]),
});

const transcribeInput = z.object({
  missionId: z.string().min(1),
  audioBase64: z.string().min(1),
  contentType: z.string().min(1).max(120),
});

type Env = {
  readonly [templarBindings.db]: D1Database;
  readonly [templarBindings.openRouterApiToken]: string;
};

export const loadDashboard = createServerFn({ method: "GET" }).handler(async (ctx) => {
  const request = requestFromContext(ctx);
  const user = await requireCurrentUser(request);
  const database = await getDatabase();
  const today = new Date();
  const todayIso = isoDate(today);
  const dayNumber = missionDayForDate(today);
  const [profile, premium] = await Promise.all([
    ensureProfile(database, user.id),
    userHasPremiumAccess(user.id),
  ]);
  const existingMission = await findMissionForDate(database, user.id, todayIso);
  const freeMissionUsed = profile.freeMissionUsedAt !== null;
  const freeMissionAvailable = !premium && !freeMissionUsed;
  const canGenerateToday = existingMission !== null || premium || freeMissionAvailable;
  const mission =
    existingMission ??
    (canGenerateToday ? await createMission(database, user.id, dayNumber, todayIso) : null);

  if (mission !== null && profile.freeMissionUsedAt === null && !premium) {
    await markFreeMissionUsed(database, profile);
  }

  const [missionRows, attemptRows, turnRows, memoryRows, readinessRows] = await Promise.all([
    readUserMissions(database, user.id),
    mission === null ? Promise.resolve([]) : readMissionAttempts(database, user.id, mission.id),
    mission === null ? Promise.resolve([]) : readRoleplayTurns(database, user.id, mission.id),
    readActiveMemories(database, user.id),
    readReadiness(database, user.id),
  ]);
  const generatedDates = new Set(missionRows.map((row) => row.missionDate));

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    access: {
      signedIn: true,
      premium,
      freeMissionAvailable,
      freeMissionUsed: freeMissionUsed || (mission !== null && !premium),
      canGenerateToday,
      gateReason: premium ? "premium" : freeMissionAvailable ? "free-mission" : "free-used",
    },
    today: {
      isoDate: todayIso,
      dayNumber,
      daysUntilTrip: daysBetween(today, new Date(`${tripStartDate}T12:00:00.000Z`)),
    },
    calendar: buildCalendar(today, generatedDates),
    mission: mission === null ? null : missionView(mission),
    attempts: attemptRows.map(attemptView),
    roleplayTurns: turnRows.map(roleplayTurnView),
    memories: memoryRows.map(memoryItemView),
    readiness: readinessRows.map(readinessView),
  } satisfies DashboardView;
});

export const evaluateAnswer = createServerFn({ method: "POST" })
  .inputValidator(evaluateAnswerInput)
  .handler(async (ctx) => {
    const request = requestFromContext(ctx);
    const user = await requireCurrentUser(request);
    const data = ctx.data;
    const database = await getDatabase();
    const mission = await requireMission(database, user.id, data.missionId);
    const missionPayload = missionView(mission);
    const prompt = missionPayload.prompts.find((item) => item.id === data.promptId);

    if (prompt === undefined) {
      throw new Error("Prompt not found.");
    }

    const premium = await userHasPremiumAccess(user.id);
    const evaluation = await generateEvaluation({
      mission: missionPayload,
      prompt,
      transcript: data.transcript,
    });
    const now = new Date();

    await database.db.insert(attempts).values({
      id: crypto.randomUUID(),
      userId: user.id,
      missionId: mission.id,
      promptId: prompt.id,
      promptText: prompt.promptEnglish,
      transcript: data.transcript,
      evaluationJson: JSON.stringify(evaluation),
      intelligibilityScore: evaluation.intelligibilityScore,
      voiceMetadataJson: JSON.stringify(data.voiceMetadata),
      createdAt: now,
    });

    if (premium) {
      await updateMemoryFromEvaluation(database, {
        userId: user.id,
        scenarioKey: missionPayload.scenarioKey,
        evaluation,
        transcript: data.transcript,
      });
      await updateReadinessFromEvaluation(database, {
        userId: user.id,
        scenarioKey: missionPayload.scenarioKey,
        evaluation,
      });
    }

    const [attemptRows, memoryRows, readinessRows] = await Promise.all([
      readMissionAttempts(database, user.id, mission.id),
      readActiveMemories(database, user.id),
      readReadiness(database, user.id),
    ]);

    return {
      evaluation,
      memoryUpdated: premium,
      attempts: attemptRows.map(attemptView),
      memories: memoryRows.map(memoryItemView),
      readiness: readinessRows.map(readinessView),
    };
  });

export const sendRoleplayTurn = createServerFn({ method: "POST" })
  .inputValidator(roleplayInput)
  .handler(async (ctx) => {
    const request = requestFromContext(ctx);
    const user = await requireCurrentUser(request);
    const data = ctx.data;
    const database = await getDatabase();
    const mission = await requireMission(database, user.id, data.missionId);
    const missionPayload = missionView(mission);
    const existingTurns = await readRoleplayTurns(database, user.id, mission.id);
    const now = new Date();

    await database.db.insert(roleplayTurns).values({
      id: crypto.randomUUID(),
      userId: user.id,
      missionId: mission.id,
      speaker: "learner",
      content: data.learnerMessage,
      createdAt: now,
    });

    const reply = await generateRoleplayReply({
      mission: missionPayload,
      turns: existingTurns.map(roleplayTurnView),
      learnerMessage: data.learnerMessage,
    });
    const replyId = crypto.randomUUID();

    await database.db.insert(roleplayTurns).values({
      id: replyId,
      userId: user.id,
      missionId: mission.id,
      speaker: "roleplay",
      content: reply.swedish,
      englishSummary: reply.englishSummary,
      model: "openrouter",
      createdAt: new Date(),
    });

    const nextTurns = await readRoleplayTurns(database, user.id, mission.id);

    return {
      reply,
      roleplayTurns: nextTurns.map(roleplayTurnView),
    };
  });

export const generateSpeechAudio = createServerFn({ method: "POST" })
  .inputValidator(speechInput)
  .handler(async (ctx) => {
    const request = requestFromContext(ctx);
    await requireCurrentUser(request);
    const { synthesizeSpeech } = await import("./voice.server.ts");

    return await synthesizeSpeech({
      text: ctx.data.text,
      route: ctx.data.route,
    });
  });

export const transcribeLearnerSpeech = createServerFn({ method: "POST" })
  .inputValidator(transcribeInput)
  .handler(async (ctx) => {
    const request = requestFromContext(ctx);
    const user = await requireCurrentUser(request);
    const premium = await userHasPremiumAccess(user.id);

    if (!premium) {
      throw new Error("Premium is required for ElevenLabs transcription.");
    }

    const database = await getDatabase();
    await requireMission(database, user.id, ctx.data.missionId);
    const { transcribeSpeech } = await import("./voice.server.ts");

    return await transcribeSpeech({
      audioBase64: ctx.data.audioBase64,
      contentType: ctx.data.contentType,
    });
  });

export const voiceRoutes = voiceModelRoutes;

function requestFromContext(ctx: unknown): Request {
  const request = (ctx as { readonly request?: Request }).request;

  if (request === undefined) {
    throw new Error("Request context unavailable.");
  }

  return request;
}

async function getDatabase(): Promise<SwedishFiftyDatabase> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as Env;

  return makeDatabase(bindings[templarBindings.db], { schema });
}

async function ensureProfile(
  database: SwedishFiftyDatabase,
  userId: string,
): Promise<UserProfileRow> {
  const existing = await database.db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const profile = existing[0];

  if (profile !== undefined) {
    return profile;
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await database.db.insert(userProfiles).values({
    id,
    userId,
    createdAt: now,
    updatedAt: now,
  });

  await Promise.all(
    scenarioDefinitions.map((scenario) =>
      database.db.insert(scenarioReadiness).values({
        id: crypto.randomUUID(),
        userId,
        scenarioKey: scenario.key,
        score: scenario.defaultScore,
        confidenceLabel: "Starting",
        evidenceSummary: "No practice logged yet.",
        createdAt: now,
        updatedAt: now,
      }),
    ),
  );

  const created = await database.db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, id))
    .limit(1);
  const createdProfile = created[0];

  if (createdProfile === undefined) {
    throw new Error("Could not create profile.");
  }

  return createdProfile;
}

async function markFreeMissionUsed(database: SwedishFiftyDatabase, profile: UserProfileRow) {
  const now = new Date();

  await database.db
    .update(userProfiles)
    .set({
      freeMissionUsedAt: now,
      updatedAt: now,
    })
    .where(eq(userProfiles.id, profile.id));
}

async function findMissionForDate(
  database: SwedishFiftyDatabase,
  userId: string,
  missionDate: string,
): Promise<MissionRow | null> {
  const rows = await database.db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.missionDate, missionDate)))
    .limit(1);

  return rows[0] ?? null;
}

async function createMission(
  database: SwedishFiftyDatabase,
  userId: string,
  dayNumber: number,
  missionDate: string,
): Promise<MissionRow> {
  const generated = await generateMission(userId, dayNumber);
  const now = new Date();
  const id = crypto.randomUUID();

  await database.db.insert(missions).values({
    id,
    userId,
    missionDate,
    dayNumber,
    scenarioKey: generated.mission.scenarioKey,
    title: generated.mission.title,
    phase: generated.mission.phase,
    difficulty: generated.mission.difficulty,
    context: generated.mission.context,
    dialogueJson: JSON.stringify(generated.mission.dialogue),
    promptsJson: JSON.stringify(generated.mission.prompts),
    roleplaySetup: generated.mission.roleplaySetup,
    coachNotesJson: JSON.stringify(generated.mission.coachNotes),
    generatedBy: generated.generatedBy,
    model: generated.model,
    createdAt: now,
    updatedAt: now,
  });

  return await requireMission(database, userId, id);
}

async function generateMission(
  userId: string,
  dayNumber: number,
): Promise<{
  readonly mission: Mission;
  readonly generatedBy: string;
  readonly model: string | null;
}> {
  const fallback = fallbackMission(dayNumber);

  try {
    const { env } = await import("cloudflare:workers");
    const bindings = env as Env;
    const apiKey = bindings[templarBindings.openRouterApiToken];

    if (apiKey.trim().length === 0) {
      return {
        mission: fallback,
        generatedBy: "fallback",
        model: null,
      };
    }

    const ai = makeAI({
      apiKey,
      appName: "Swedish Fifty",
      siteUrl: "https://swedish-fifty.ericventor.com",
    });
    const result = await Effect.runPromise(
      ai.generateObject({
        model: "cheap",
        temperature: 0.5,
        maxTokens: 1800,
        schema: missionSchema,
        messages: [
          {
            role: "system",
            content: [
              "You generate one short daily Swedish speaking mission.",
              "The learner is Eric, has very little Swedish, decent pronunciation, and is preparing for a July 23-30 Sweden trip.",
              "Stockholm and family conversation are the default context.",
              "Prioritize whether a Swede would understand Eric over perfect grammar.",
              "Use ASCII transliterations for Swedish characters in this product pass: ar, trott, traffa, mar.",
              "Keep the mission to 5-15 minutes with 3-6 push-to-talk prompts.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Generate day ${dayNumber} of 50.`,
              `Phase: ${fallback.phase}.`,
              `Suggested scenario: ${scenarioLabel(scenarioForDay(dayNumber))}.`,
              `User id for memory context: ${userId}.`,
              "Include a short dialogue, practical prompts, and a realistic roleplay setup.",
            ].join("\n"),
          },
        ],
      }),
    );

    return {
      mission: result.value,
      generatedBy: "ai",
      model: result.model,
    };
  } catch {
    return {
      mission: fallback,
      generatedBy: "fallback",
      model: null,
    };
  }
}

async function generateEvaluation(input: {
  readonly mission: MissionView;
  readonly prompt: MissionView["prompts"][number];
  readonly transcript: string;
}): Promise<MissionEvaluation> {
  const fallback = heuristicEvaluation(
    input.prompt.expectedSwedish,
    input.transcript,
    input.prompt.tone,
  );

  try {
    const { env } = await import("cloudflare:workers");
    const bindings = env as Env;
    const apiKey = bindings[templarBindings.openRouterApiToken];

    if (apiKey.trim().length === 0) {
      return fallback;
    }

    const ai = makeAI({
      apiKey,
      appName: "Swedish Fifty",
      siteUrl: "https://swedish-fifty.ericventor.com",
    });
    const result = await Effect.runPromise(
      ai.generateObject({
        model: "cheap",
        temperature: 0.2,
        maxTokens: 900,
        schema: evaluationSchema,
        messages: [
          {
            role: "system",
            content: [
              "You evaluate a beginner Swedish learner.",
              "Primary question: would a Swedish speaker understand what the learner meant?",
              "Be specific, practical, and non-punitive.",
              "Point out one correction only. Use ASCII transliterations for Swedish characters.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              missionTitle: input.mission.title,
              scenario: input.mission.scenarioKey,
              prompt: input.prompt.promptEnglish,
              expectedSwedish: input.prompt.expectedSwedish,
              tone: input.prompt.tone,
              learnerTranscript: input.transcript,
            }),
          },
        ],
      }),
    );

    return result.value;
  } catch {
    return fallback;
  }
}

async function generateRoleplayReply(input: {
  readonly mission: MissionView;
  readonly turns: readonly RoleplayTurnView[];
  readonly learnerMessage: string;
}): Promise<RoleplayReply> {
  const fallback: RoleplayReply = {
    swedish: "Vad roligt. Kan du saga lite mer?",
    englishSummary: "They are asking you to say a little more.",
    shouldEnd: input.turns.length >= 4,
    ...(input.turns.length >= 4
      ? {
          coachDebrief: {
            understandable: "You kept the exchange moving.",
            moreNatural: "Try a short answer plus one follow-up question.",
            tomorrow: input.mission.coachNotes.nextFocus,
          },
        }
      : {}),
  };

  try {
    const { env } = await import("cloudflare:workers");
    const bindings = env as Env;
    const apiKey = bindings[templarBindings.openRouterApiToken];

    if (apiKey.trim().length === 0) {
      return fallback;
    }

    const ai = makeAI({
      apiKey,
      appName: "Swedish Fifty",
      siteUrl: "https://swedish-fifty.ericventor.com",
    });
    const result = await Effect.runPromise(
      ai.generateObject({
        model: "cheap",
        temperature: 0.5,
        maxTokens: 700,
        schema: roleplayReplySchema,
        messages: [
          {
            role: "system",
            content: [
              "You are in roleplay mode, not coach mode.",
              "Act like a realistic Swedish-speaking person in the scenario.",
              "Use simple Swedish. Do not correct during the roleplay.",
              "After 3-5 learner turns, include a concise coachDebrief and set shouldEnd true.",
              "Use ASCII transliterations for Swedish characters.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              mission: input.mission,
              previousTurns: input.turns,
              learnerMessage: input.learnerMessage,
            }),
          },
        ],
      }),
    );

    return result.value;
  } catch {
    return fallback;
  }
}

function heuristicEvaluation(
  expectedSwedish: string,
  transcript: string,
  tone: "casual_family" | "polite_public",
): MissionEvaluation {
  const expectedWords = importantWords(expectedSwedish);
  const transcriptWords = new Set(importantWords(transcript));
  const hits = expectedWords.filter((word) => transcriptWords.has(word)).length;
  const score =
    expectedWords.length === 0
      ? 55
      : Math.max(35, Math.min(92, Math.round((hits / expectedWords.length) * 100)));
  const understandable = score >= 55;

  return {
    understandable,
    intelligibilityScore: score,
    naturalnessScore: Math.max(35, Math.min(88, score - 6)),
    toneAppropriate: tone === "casual_family" || transcript.toLowerCase().includes("tack"),
    feedback: understandable
      ? "Understandable. Keep it short and say the key Swedish words clearly."
      : "The meaning may not land yet. Repeat the core phrase once more, slowly.",
    moreNaturalSwedish: expectedSwedish,
    pronunciationNote: "No pronunciation score was available, so this is based on the transcript.",
    memorySignal: understandable
      ? {
          kind: "strength",
          pattern: `Produced enough of: ${expectedSwedish}`,
          evidence: transcript,
          nextPractice: "Use the same phrase in a short follow-up.",
        }
      : {
          kind: "weakness",
          pattern: `Needs more practice with: ${expectedSwedish}`,
          evidence: transcript,
          nextPractice: "Repeat the phrase in two chunks before answering.",
        },
  };
}

function importantWords(value: string): string[] {
  const stop = new Set(["jag", "du", "det", "ar", "en", "ett", "och", "tack"]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stop.has(word));
}

async function updateMemoryFromEvaluation(
  database: SwedishFiftyDatabase,
  input: {
    readonly userId: string;
    readonly scenarioKey: ScenarioKey;
    readonly evaluation: MissionEvaluation;
    readonly transcript: string;
  },
) {
  const signal = input.evaluation.memorySignal;

  if (signal === undefined) {
    return;
  }

  const now = new Date();

  await database.db.insert(memoryItems).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    kind: signal.kind,
    scenarioKey: input.scenarioKey,
    pattern: signal.pattern,
    evidence: signal.evidence || input.transcript,
    nextPractice: signal.nextPractice,
    status: input.evaluation.understandable && signal.kind === "weakness" ? "archived" : "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function updateReadinessFromEvaluation(
  database: SwedishFiftyDatabase,
  input: {
    readonly userId: string;
    readonly scenarioKey: ScenarioKey;
    readonly evaluation: MissionEvaluation;
  },
) {
  const rows = await database.db
    .select()
    .from(scenarioReadiness)
    .where(
      and(
        eq(scenarioReadiness.userId, input.userId),
        eq(scenarioReadiness.scenarioKey, input.scenarioKey),
      ),
    )
    .limit(1);
  const existing = rows[0];
  const now = new Date();
  const delta =
    input.evaluation.intelligibilityScore >= 75
      ? 4
      : input.evaluation.intelligibilityScore >= 55
        ? 2
        : -1;
  const nextScore = clamp((existing?.score ?? 10) + delta, 0, 100);
  const label = readinessLabel(nextScore);

  if (existing === undefined) {
    await database.db.insert(scenarioReadiness).values({
      id: crypto.randomUUID(),
      userId: input.userId,
      scenarioKey: input.scenarioKey,
      score: nextScore,
      confidenceLabel: label,
      evidenceSummary: input.evaluation.feedback,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  await database.db
    .update(scenarioReadiness)
    .set({
      score: nextScore,
      confidenceLabel: label,
      evidenceSummary: input.evaluation.feedback,
      updatedAt: now,
    })
    .where(eq(scenarioReadiness.id, existing.id));
}

async function requireMission(
  database: SwedishFiftyDatabase,
  userId: string,
  missionId: string,
): Promise<MissionRow> {
  const rows = await database.db
    .select()
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.id, missionId)))
    .limit(1);
  const mission = rows[0];

  if (mission === undefined) {
    throw new Error("Mission not found.");
  }

  return mission;
}

async function readUserMissions(
  database: SwedishFiftyDatabase,
  userId: string,
): Promise<MissionRow[]> {
  return await database.db
    .select()
    .from(missions)
    .where(eq(missions.userId, userId))
    .orderBy(desc(missions.missionDate))
    .limit(50);
}

async function readMissionAttempts(
  database: SwedishFiftyDatabase,
  userId: string,
  missionId: string,
): Promise<AttemptRow[]> {
  return await database.db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.missionId, missionId)))
    .orderBy(desc(attempts.createdAt))
    .limit(20);
}

async function readRoleplayTurns(
  database: SwedishFiftyDatabase,
  userId: string,
  missionId: string,
): Promise<RoleplayTurnRow[]> {
  return (
    await database.db
      .select()
      .from(roleplayTurns)
      .where(and(eq(roleplayTurns.userId, userId), eq(roleplayTurns.missionId, missionId)))
      .orderBy(desc(roleplayTurns.createdAt))
      .limit(12)
  ).toReversed();
}

async function readActiveMemories(
  database: SwedishFiftyDatabase,
  userId: string,
): Promise<MemoryItemRow[]> {
  return await database.db
    .select()
    .from(memoryItems)
    .where(and(eq(memoryItems.userId, userId), eq(memoryItems.status, "active")))
    .orderBy(desc(memoryItems.updatedAt))
    .limit(8);
}

async function readReadiness(
  database: SwedishFiftyDatabase,
  userId: string,
): Promise<ReadinessRow[]> {
  return await database.db
    .select()
    .from(scenarioReadiness)
    .where(eq(scenarioReadiness.userId, userId))
    .orderBy(desc(scenarioReadiness.updatedAt));
}

function missionView(row: MissionRow): MissionView {
  return {
    id: row.id,
    missionDate: row.missionDate,
    dayNumber: row.dayNumber,
    title: row.title,
    scenarioKey: row.scenarioKey,
    phase: row.phase,
    difficulty: row.difficulty,
    context: row.context,
    dialogue: parseJson(row.dialogueJson, fallbackMission(row.dayNumber).dialogue),
    prompts: parseJson(row.promptsJson, fallbackMission(row.dayNumber).prompts),
    roleplaySetup: row.roleplaySetup,
    coachNotes: parseJson(row.coachNotesJson, fallbackMission(row.dayNumber).coachNotes),
    generatedBy: row.generatedBy,
    model: row.model,
  };
}

function attemptView(row: AttemptRow): AttemptView {
  return {
    id: row.id,
    promptId: row.promptId,
    promptText: row.promptText,
    transcript: row.transcript,
    evaluation: parseJson(
      row.evaluationJson,
      heuristicEvaluation(row.promptText, row.transcript, "casual_family"),
    ),
    intelligibilityScore: row.intelligibilityScore,
    createdAt: row.createdAt.toISOString(),
  };
}

function roleplayTurnView(row: RoleplayTurnRow): RoleplayTurnView {
  return {
    id: row.id,
    speaker: row.speaker,
    content: row.content,
    englishSummary: row.englishSummary,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

function memoryItemView(row: MemoryItemRow): MemoryItemView {
  return {
    id: row.id,
    kind: row.kind,
    scenarioKey: row.scenarioKey,
    scenarioLabel: scenarioLabel(row.scenarioKey),
    pattern: row.pattern,
    evidence: row.evidence,
    nextPractice: row.nextPractice,
  };
}

function readinessView(row: ReadinessRow): ReadinessView {
  const definition = scenarioDefinitions.find((scenario) => scenario.key === row.scenarioKey);

  return {
    scenarioKey: row.scenarioKey,
    label: definition?.label ?? row.scenarioKey,
    shortLabel: definition?.shortLabel ?? row.scenarioKey,
    score: row.score,
    confidenceLabel: row.confidenceLabel,
    evidenceSummary: row.evidenceSummary,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readinessLabel(score: number): string {
  if (score >= 75) {
    return "Ready to try live";
  }

  if (score >= 45) {
    return "Getting usable";
  }

  if (score >= 20) {
    return "Needs repetition";
  }

  return "Starting";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

export type { VoiceModelRoute } from "./voice-models.ts";
export type {
  AccessView,
  AttemptView,
  DashboardView,
  MemoryItemView,
  MissionView,
  ReadinessView,
  RoleplayTurnView,
};
