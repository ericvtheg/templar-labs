import { authSchema } from "@templar/auth/schema";
import { index, integer, sqliteTable, text, uniqueIndex } from "@templar/db/sqlite-core";
import { paymentsSchema } from "@templar/payments/schema";

export const scenarioKeys = [
  "family_conversation",
  "grandmas_birthday",
  "stockholm_transit",
  "food_and_cafes",
  "ferry_and_day_travel",
  "city_interactions",
  "listening_comprehension",
] as const;

export const memoryKinds = [
  "weakness",
  "strength",
  "mastered_phrase",
  "recurring_mistake",
] as const;

export const userProfiles = sqliteTable(
  "swedish_fifty_user_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    startingLevel: text("starting_level").notNull().default("very_little_swedish"),
    targetTripStart: text("target_trip_start").notNull().default("2026-07-23"),
    targetTripEnd: text("target_trip_end").notNull().default("2026-07-30"),
    homeLanguage: text("home_language").notNull().default("English"),
    swedishConfidence: integer("swedish_confidence").notNull().default(1),
    pronunciationConfidence: integer("pronunciation_confidence").notNull().default(3),
    coachSwedishRatio: integer("coach_swedish_ratio").notNull().default(10),
    freeMissionUsedAt: integer("free_mission_used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("swedish_fifty_user_profiles_user_uidx").on(table.userId)],
);

export const missions = sqliteTable(
  "swedish_fifty_missions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    missionDate: text("mission_date").notNull(),
    dayNumber: integer("day_number").notNull(),
    scenarioKey: text("scenario_key", { enum: scenarioKeys }).notNull(),
    title: text("title").notNull(),
    phase: text("phase").notNull(),
    difficulty: integer("difficulty").notNull(),
    context: text("context").notNull(),
    dialogueJson: text("dialogue_json").notNull(),
    promptsJson: text("prompts_json").notNull(),
    roleplaySetup: text("roleplay_setup").notNull(),
    coachNotesJson: text("coach_notes_json").notNull(),
    generatedBy: text("generated_by").notNull(),
    model: text("model"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("swedish_fifty_missions_user_date_uidx").on(table.userId, table.missionDate),
    index("swedish_fifty_missions_user_idx").on(table.userId),
  ],
);

export const attempts = sqliteTable(
  "swedish_fifty_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull(),
    promptText: text("prompt_text").notNull(),
    transcript: text("transcript").notNull(),
    evaluationJson: text("evaluation_json").notNull(),
    intelligibilityScore: integer("intelligibility_score").notNull(),
    voiceMetadataJson: text("voice_metadata_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("swedish_fifty_attempts_user_idx").on(table.userId),
    index("swedish_fifty_attempts_mission_idx").on(table.missionId),
  ],
);

export const roleplayTurns = sqliteTable(
  "swedish_fifty_roleplay_turns",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    speaker: text("speaker", { enum: ["learner", "roleplay"] }).notNull(),
    content: text("content").notNull(),
    englishSummary: text("english_summary"),
    model: text("model"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("swedish_fifty_roleplay_turns_user_idx").on(table.userId),
    index("swedish_fifty_roleplay_turns_mission_idx").on(table.missionId),
  ],
);

export const memoryItems = sqliteTable(
  "swedish_fifty_memory_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: memoryKinds }).notNull(),
    scenarioKey: text("scenario_key", { enum: scenarioKeys }).notNull(),
    pattern: text("pattern").notNull(),
    evidence: text("evidence").notNull(),
    nextPractice: text("next_practice").notNull(),
    status: text("status", { enum: ["active", "mastered", "archived"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("swedish_fifty_memory_items_user_idx").on(table.userId),
    index("swedish_fifty_memory_items_user_scenario_idx").on(table.userId, table.scenarioKey),
  ],
);

export const scenarioReadiness = sqliteTable(
  "swedish_fifty_scenario_readiness",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    scenarioKey: text("scenario_key", { enum: scenarioKeys }).notNull(),
    score: integer("score").notNull().default(8),
    confidenceLabel: text("confidence_label").notNull().default("Starting"),
    evidenceSummary: text("evidence_summary").notNull().default("No practice logged yet."),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("swedish_fifty_scenario_readiness_user_scenario_uidx").on(
      table.userId,
      table.scenarioKey,
    ),
    index("swedish_fifty_scenario_readiness_user_idx").on(table.userId),
  ],
);

export const appSchema = {
  userProfiles,
  missions,
  attempts,
  roleplayTurns,
  memoryItems,
  scenarioReadiness,
};

export const schema = {
  ...authSchema,
  ...paymentsSchema,
  ...appSchema,
};
