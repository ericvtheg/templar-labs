import { integer, sqliteTable, text } from "@templar/db/sqlite-core";

export const launchProjects = sqliteTable("launch_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  audience: text("audience").notNull(),
  problem: text("problem").notNull(),
  distribution: text("distribution").notNull(),
  status: text("status", {
    enum: ["draft", "analyzing", "ready", "shipped"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const launchReports = sqliteTable("launch_reports", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => launchProjects.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["first_pass", "deep_analysis"] }).notNull(),
  summary: text("summary").notNull(),
  mvpScope: text("mvp_scope").notNull(),
  risks: text("risks", { mode: "json" }).$type<string[]>().notNull(),
  launchPlan: text("launch_plan", { mode: "json" }).$type<string[]>().notNull(),
  socialPosts: text("social_posts", { mode: "json" }).$type<string[]>().notNull(),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const launchArtifacts = sqliteTable("launch_artifacts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => launchProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["note", "file", "generated"] }).notNull(),
  blobKey: text("blob_key").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const launchAnalysisJobs = sqliteTable("launch_analysis_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => launchProjects.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["queued", "processing", "completed", "failed"] }).notNull(),
  message: text("message").notNull(),
  queuedAt: integer("queued_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const launchEvents = sqliteTable("launch_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").references(() => launchProjects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
