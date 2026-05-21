import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { makeAI } from "@templar/ai";
import { makeBlob } from "@templar/blob";
import { makeCache } from "@templar/cache";
import { and, databaseError, desc, eq, makeDatabase } from "@templar/db";
import { cloudflareQueueMessage, makeQueue } from "@templar/queue";
import { Effect } from "effect";
import { z } from "zod";
import { templarBindings } from "../../../templar-bindings.ts";
import * as schema from "../db/schema.ts";
import {
  launchAnalysisJobs,
  launchArtifacts,
  launchEvents,
  launchProjects,
  launchReports,
} from "../db/schema.ts";

type AnalysisQueueJob = {
  readonly id: string;
  readonly projectId: string;
};

type Env = {
  readonly [templarBindings.cache]: KVNamespace;
  readonly [templarBindings.db]: D1Database;
  readonly [templarBindings.jobsQueue]: Queue<string>;
  readonly [templarBindings.openRouterApiKey]?: string;
  readonly [templarBindings.r2]: R2Bucket;
};

const dashboardCacheKey = "launch-room/dashboard";

const launchReportSchema = z.object({
  summary: z.string(),
  mvpScope: z.string(),
  risks: z.array(z.string()).min(3).max(5),
  launchPlan: z.array(z.string()).min(4).max(6),
  socialPosts: z.array(z.string()).min(2).max(4),
});

type GeneratedLaunchReport = z.output<typeof launchReportSchema> & {
  readonly model: string;
  readonly provider: string;
};

const fetch = createStartHandler(defaultStreamHandler);

export default {
  fetch,
  async queue(batch: MessageBatch<string>, env: Env) {
    const database = makeDatabase(env[templarBindings.db], { schema });
    const queue = makeQueue(env[templarBindings.jobsQueue]);
    const blob = makeBlob(env[templarBindings.r2]);
    const cache = makeCache(env[templarBindings.cache]);

    await Effect.runPromise(
      Effect.forEach(batch.messages, (message) =>
        Effect.gen(function* () {
          const stored = cloudflareQueueMessage(message);
          const job = yield* queue.deserialize<AnalysisQueueJob>(stored);
          const startedAt = new Date();

          yield* updateJob(database, job.body.id, {
            status: "processing",
            message: "Reading project context.",
            startedAt,
          });

          const project = yield* readProject(database, job.body.projectId);
          const contextNotes = yield* readContextNotes(database, blob, job.body.projectId);
          const report = yield* Effect.tryPromise({
            try: () =>
              generateLaunchReport({
                env,
                project,
                contextNotes,
              }),
            catch: (cause) => cause,
          });
          const completedAt = new Date();

          yield* writeReport(database, blob, project.id, report, completedAt);

          yield* Effect.tryPromise({
            try: () =>
              database.db
                .update(launchProjects)
                .set({
                  status: "ready",
                  updatedAt: completedAt,
                })
                .where(eq(launchProjects.id, project.id)),
            catch: (cause) =>
              databaseError({
                operation: "update",
                table: "launch_projects",
                cause,
              }),
          });

          yield* updateJob(database, job.body.id, {
            status: "completed",
            message: "Deep analysis completed.",
            completedAt,
          });
          yield* writeEvent(
            database,
            project.id,
            "analytics.deep_analysis_completed",
            "Deep analysis completed.",
          );
          yield* cache.delete(dashboardCacheKey);
          yield* queue.ack(stored);
        }).pipe(
          Effect.catchAll((cause) =>
            Effect.gen(function* () {
              const stored = cloudflareQueueMessage(message);
              const queueMessage = yield* queue.deserialize<AnalysisQueueJob>(stored);

              yield* updateJob(database, queueMessage.body.id, {
                status: "failed",
                message: cause instanceof Error ? cause.message : "Deep analysis failed.",
                completedAt: new Date(),
              });
              yield* queue.ack(stored);
            }),
          ),
        ),
      ),
    );
  },
};

type LaunchDatabase = ReturnType<typeof makeDatabase<typeof schema>>;

function readProject(database: LaunchDatabase, projectId: string) {
  return Effect.flatMap(
    Effect.tryPromise({
      try: () =>
        database.db.select().from(launchProjects).where(eq(launchProjects.id, projectId)).limit(1),
      catch: (cause) =>
        databaseError({
          operation: "select",
          table: "launch_projects",
          cause,
        }),
    }),
    (rows) => {
      const project = rows[0];

      if (project === undefined) {
        return Effect.fail(new Error(`Project not found: ${projectId}`));
      }

      return Effect.succeed(project);
    },
  );
}

function readContextNotes(
  database: LaunchDatabase,
  blob: ReturnType<typeof makeBlob>,
  projectId: string,
) {
  return Effect.gen(function* () {
    const artifacts = yield* Effect.tryPromise({
      try: () =>
        database.db
          .select()
          .from(launchArtifacts)
          .where(and(eq(launchArtifacts.projectId, projectId), eq(launchArtifacts.kind, "note")))
          .orderBy(desc(launchArtifacts.createdAt))
          .limit(8),
      catch: (cause) =>
        databaseError({
          operation: "select",
          table: "launch_artifacts",
          cause,
        }),
    });

    return yield* Effect.forEach(artifacts, (artifact) => blob.text(artifact.blobKey), {
      concurrency: 2,
    });
  });
}

function writeReport(
  database: LaunchDatabase,
  blob: ReturnType<typeof makeBlob>,
  projectId: string,
  report: GeneratedLaunchReport,
  createdAt: Date,
) {
  return Effect.gen(function* () {
    const reportId = crypto.randomUUID();
    const blobKey = `projects/${projectId}/reports/${reportId}.json`;

    yield* blob.put({
      key: blobKey,
      body: JSON.stringify(report, null, 2),
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
      },
      metadata: {
        projectId,
        kind: "deep_analysis",
      },
    });

    yield* Effect.tryPromise({
      try: () =>
        database.db.insert(launchReports).values({
          id: reportId,
          projectId,
          kind: "deep_analysis",
          summary: report.summary,
          mvpScope: report.mvpScope,
          risks: [...report.risks],
          launchPlan: [...report.launchPlan],
          socialPosts: [...report.socialPosts],
          model: report.model,
          provider: report.provider,
          createdAt,
        }),
      catch: (cause) =>
        databaseError({
          operation: "insert",
          table: "launch_reports",
          cause,
        }),
    });

    yield* Effect.tryPromise({
      try: () =>
        database.db.insert(launchArtifacts).values({
          id: crypto.randomUUID(),
          projectId,
          name: "Deep analysis report",
          kind: "generated",
          blobKey,
          contentType: "application/json; charset=utf-8",
          createdAt,
        }),
      catch: (cause) =>
        databaseError({
          operation: "insert",
          table: "launch_artifacts",
          cause,
        }),
    });
  });
}

function updateJob(
  database: LaunchDatabase,
  jobId: string,
  values: Partial<typeof launchAnalysisJobs.$inferInsert>,
) {
  return Effect.tryPromise({
    try: () =>
      database.db.update(launchAnalysisJobs).set(values).where(eq(launchAnalysisJobs.id, jobId)),
    catch: (cause) =>
      databaseError({
        operation: "update",
        table: "launch_analysis_jobs",
        cause,
      }),
  });
}

function writeEvent(
  database: LaunchDatabase,
  projectId: string | null,
  type: string,
  message: string,
) {
  return Effect.tryPromise({
    try: () =>
      database.db.insert(launchEvents).values({
        projectId,
        type,
        message,
        createdAt: new Date(),
      }),
    catch: (cause) =>
      databaseError({
        operation: "insert",
        table: "launch_events",
        cause,
      }),
  });
}

async function generateLaunchReport(input: {
  readonly env: Env;
  readonly project: typeof launchProjects.$inferSelect;
  readonly contextNotes: readonly string[];
}): Promise<GeneratedLaunchReport> {
  const apiKey = input.env[templarBindings.openRouterApiKey];

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return heuristicLaunchReport(input.project, input.contextNotes);
  }

  try {
    const ai = makeAI({
      apiKey,
      appName: "Launch Room",
      siteUrl: "https://launch-room.ericventor.com",
    });
    const result = await Effect.runPromise(
      ai.generateObject({
        model: "reasoning",
        temperature: 0.35,
        maxTokens: 1600,
        schema: launchReportSchema,
        messages: [
          {
            role: "system",
            content:
              "You are a concise startup launch strategist. Use attached context and return specific product launch guidance for a solo builder.",
          },
          {
            role: "user",
            content: [
              `Project: ${input.project.name}`,
              `Audience: ${input.project.audience}`,
              `Problem: ${input.project.problem}`,
              `Distribution: ${input.project.distribution}`,
              input.contextNotes.length === 0
                ? "Context notes: none"
                : `Context notes:\n${input.contextNotes.join("\n\n---\n\n")}`,
            ].join("\n"),
          },
        ],
      }),
    );

    return {
      ...result.value,
      model: result.model,
      provider: result.provider,
    };
  } catch {
    return heuristicLaunchReport(input.project, input.contextNotes);
  }
}

function heuristicLaunchReport(
  project: typeof launchProjects.$inferSelect,
  contextNotes: readonly string[],
): GeneratedLaunchReport {
  const contextSummary =
    contextNotes.length === 0
      ? "No additional context was attached."
      : `${contextNotes.length} context note(s) were attached.`;

  return {
    summary: `${project.name} has enough shape for a focused launch if it stays centered on ${project.audience}. The product should make the next step obvious instead of behaving like an open-ended workspace. ${contextSummary}`,
    mvpScope:
      "Build one opinionated path: intake, context capture, AI report, queued deep analysis, and a final launch checklist with reusable content drafts.",
    risks: [
      "The positioning may drift wider than the original audience.",
      "The context workflow may need stronger constraints to avoid becoming a notes app.",
      "The launch channel needs proof from repeated posts or outreach, not a one-time announcement.",
      "Generated output needs enough structure that users can compare projects quickly.",
    ],
    launchPlan: [
      "Pick one representative idea and publish the full before/after workflow.",
      "Invite five solo builders to submit one stalled idea.",
      "Turn every analysis into a public-facing artifact that can be screenshotted.",
      "Measure whether users copy, edit, or complete the generated checklist.",
      "Only add collaboration after the one-user loop is obviously valuable.",
    ],
    socialPosts: [
      `I ran ${project.name} through Launch Room and got a concrete launch checklist instead of another generic brainstorm.`,
      "The product pattern I like: save context once, queue deeper analysis, then turn it into launchable artifacts.",
    ],
    model: "local-heuristic",
    provider: "fallback",
  };
}
