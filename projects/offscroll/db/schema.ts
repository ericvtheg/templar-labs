import { index, integer, primaryKey, sqliteTable, text } from "@templar/db/sqlite-core";

export const profiles = sqliteTable("offscroll_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  goal: integer("goal").notNull().default(45),
  baseline: integer("baseline").notNull().default(120),
});

export const challenges = sqliteTable("offscroll_challenges", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  reward: text("reward").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  goal: integer("goal").notNull(),
  color: text("color", { enum: ["sage", "lavender", "peach"] }).notNull(),
  creatorId: text("creator_id")
    .notNull()
    .references(() => profiles.id),
  inviteToken: text("invite_token").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const members = sqliteTable(
  "offscroll_members",
  {
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.challengeId, table.userId] }),
    index("offscroll_members_user_idx").on(table.userId),
  ],
);

export const usage = sqliteTable(
  "offscroll_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    date: text("date").notNull(),
    instagram: integer("instagram").notNull(),
    tiktok: integer("tiktok").notNull(),
    youtube: integer("youtube").notNull(),
    other: integer("other").notNull(),
    note: text("note").notNull().default(""),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })],
);
