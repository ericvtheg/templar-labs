import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const speechJobs = sqliteTable("speech_jobs", {
  cacheKey: text("cache_key").primaryKey(),
  token: text("token").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    bucket: integer("bucket").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind, table.bucket] })],
);
export const coachScenes = sqliteTable("coach_scenes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  missionId: text("mission_id").notNull(),
  target: text("target").notNull(),
  scene: text("scene").notNull(),
  history: text("history").notNull(),
  turns: integer("turns").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const mastery = sqliteTable(
  "mastery",
  {
    userId: text("user_id").notNull(),
    missionId: text("mission_id").notNull(),
    task: integer("task").notNull(),
    level: integer("level").notNull(),
    due: integer("due").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.missionId, table.task] })],
);
export const completions = sqliteTable(
  "completions",
  {
    userId: text("user_id").notNull(),
    missionId: text("mission_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.missionId] })],
);
export const cheers = sqliteTable(
  "cheers",
  {
    userId: text("user_id").notNull(),
    targetId: text("target_id").notNull(),
    missionId: text("mission_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.targetId, table.missionId] })],
);
