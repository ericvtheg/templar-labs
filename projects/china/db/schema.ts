import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
