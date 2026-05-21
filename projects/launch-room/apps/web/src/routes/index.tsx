import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { makeAI } from "@templar/ai";
import { makeBlob } from "@templar/blob";
import { makeCache } from "@templar/cache";
import { databaseError, desc, eq, makeDatabase } from "@templar/db";
import { withLogContext } from "@templar/logger";
import { makeQueue } from "@templar/queue";
import { Alert, AlertDescription, AlertTitle } from "@templar/ui/components/alert";
import { Badge } from "@templar/ui/components/badge";
import { Button } from "@templar/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@templar/ui/components/card";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { Progress } from "@templar/ui/components/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@templar/ui/components/tabs";
import { Textarea } from "@templar/ui/components/textarea";
import { Effect } from "effect";
import { CheckCircle2Icon, ClipboardListIcon, LightbulbIcon, RocketIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { z } from "zod";
import { templarBindings } from "../../../../templar-bindings.ts";
import * as schema from "../../db/schema.ts";
import {
  launchAnalysisJobs,
  launchArtifacts,
  launchEvents,
  launchProjects,
  launchReports,
} from "../../db/schema.ts";
import { authClient } from "../lib/auth-client.ts";

export const Route = createFileRoute("/")({
  loader: () => getDashboard(),
  component: Home,
});

const dashboardCacheKey = "launch-room/dashboard";

const projectInputSchema = z.object({
  name: z.string().min(2).max(80),
  audience: z.string().min(4).max(180),
  problem: z.string().min(8).max(360),
  distribution: z.string().min(4).max(240),
});

const noteInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(2).max(80),
  body: z.string().min(4).max(4000),
});

const projectIdInputSchema = z.object({
  projectId: z.string().min(1),
});

const launchReportSchema = z.object({
  summary: z.string(),
  mvpScope: z.string(),
  risks: z.array(z.string()).min(3).max(5),
  launchPlan: z.array(z.string()).min(4).max(6),
  socialPosts: z.array(z.string()).min(2).max(4),
});

type LaunchProject = {
  readonly id: string;
  readonly name: string;
  readonly audience: string;
  readonly problem: string;
  readonly distribution: string;
  readonly status: "draft" | "analyzing" | "ready" | "shipped";
  readonly createdAt: string;
  readonly updatedAt: string;
};

type LaunchReport = {
  readonly id: string;
  readonly projectId: string;
  readonly kind: "first_pass" | "deep_analysis";
  readonly summary: string;
  readonly mvpScope: string;
  readonly risks: readonly string[];
  readonly launchPlan: readonly string[];
  readonly socialPosts: readonly string[];
  readonly model: string;
  readonly provider: string;
  readonly createdAt: string;
};

type LaunchArtifact = {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly kind: "note" | "file" | "generated";
  readonly blobKey: string;
  readonly contentType: string;
  readonly createdAt: string;
};

type LaunchJob = {
  readonly id: string;
  readonly projectId: string;
  readonly status: "queued" | "processing" | "completed" | "failed";
  readonly message: string;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
};

type LaunchEvent = {
  readonly id: number;
  readonly projectId: string | null;
  readonly type: string;
  readonly message: string;
  readonly createdAt: string;
};

type DashboardData = {
  readonly projects: readonly LaunchProject[];
  readonly reports: readonly LaunchReport[];
  readonly artifacts: readonly LaunchArtifact[];
  readonly jobs: readonly LaunchJob[];
  readonly events: readonly LaunchEvent[];
  readonly cache: {
    readonly key: string;
    readonly generatedAt: string;
  };
};

type AnalysisQueueJob = {
  readonly id: string;
  readonly projectId: string;
};

type AppEnv = {
  readonly [templarBindings.cache]: KVNamespace;
  readonly [templarBindings.db]: D1Database;
  readonly [templarBindings.jobsQueue]: Queue<string>;
  readonly [templarBindings.openRouterApiKey]?: string;
  readonly [templarBindings.r2]: R2Bucket;
};

type LaunchDatabase = ReturnType<typeof makeDatabase<typeof schema>>;

const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const env = await getEnv();
  const database = makeDatabase(env[templarBindings.db], { schema });
  const cache = makeCache(env[templarBindings.cache]);

  return await Effect.runPromise(
    cache.getOrSet<DashboardData>({
      key: dashboardCacheKey,
      ttlSeconds: 60,
      compute: Effect.orDie(readDashboard(database)),
      metadata: {
        product: "launch-room",
      },
    }),
  );
});

const createProject = createServerFn({ method: "POST" })
  .inputValidator(projectInputSchema)
  .handler(async ({ data }) => {
    const env = await getEnv();
    const database = makeDatabase(env[templarBindings.db], { schema });
    const blob = makeBlob(env[templarBindings.r2]);
    const cache = makeCache(env[templarBindings.cache]);
    const now = new Date();
    const projectId = crypto.randomUUID();

    const report = await generateLaunchReport({
      env,
      project: {
        name: data.name,
        audience: data.audience,
        problem: data.problem,
        distribution: data.distribution,
      },
      contextNotes: [],
      kind: "first_pass",
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* withLogContext(Effect.logInfo("Creating launch project"), {
          projectId,
          feature: "launch-project-create",
        });

        yield* Effect.tryPromise({
          try: () =>
            database.db.insert(launchProjects).values({
              id: projectId,
              name: data.name,
              audience: data.audience,
              problem: data.problem,
              distribution: data.distribution,
              status: "draft",
              createdAt: now,
              updatedAt: now,
            }),
          catch: (cause) =>
            databaseError({
              operation: "insert",
              table: "launch_projects",
              cause,
            }),
        });

        yield* writeReport(database, blob, projectId, "first_pass", report, now);
        yield* writeEvent(database, projectId, "analytics.idea_created", "Idea created.");
        yield* writeEvent(
          database,
          projectId,
          "analytics.report_generated",
          "First-pass report generated.",
        );
        yield* cache.delete(dashboardCacheKey);
      }),
    );

    return await Effect.runPromise(readDashboard(database));
  });

const addContextNote = createServerFn({ method: "POST" })
  .inputValidator(noteInputSchema)
  .handler(async ({ data }) => {
    const env = await getEnv();
    const database = makeDatabase(env[templarBindings.db], { schema });
    const blob = makeBlob(env[templarBindings.r2]);
    const cache = makeCache(env[templarBindings.cache]);
    const now = new Date();
    const artifactId = crypto.randomUUID();
    const blobKey = `projects/${data.projectId}/notes/${artifactId}.md`;

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* blob.put({
          key: blobKey,
          body: data.body,
          httpMetadata: {
            contentType: "text/markdown; charset=utf-8",
          },
          metadata: {
            projectId: data.projectId,
            kind: "note",
          },
        });

        yield* Effect.tryPromise({
          try: () =>
            database.db.insert(launchArtifacts).values({
              id: artifactId,
              projectId: data.projectId,
              name: data.name,
              kind: "note",
              blobKey,
              contentType: "text/markdown; charset=utf-8",
              createdAt: now,
            }),
          catch: (cause) =>
            databaseError({
              operation: "insert",
              table: "launch_artifacts",
              cause,
            }),
        });

        yield* writeEvent(
          database,
          data.projectId,
          "analytics.context_added",
          "Context note saved.",
        );
        yield* cache.delete(dashboardCacheKey);
      }),
    );

    return await Effect.runPromise(readDashboard(database));
  });

const enqueueDeepAnalysis = createServerFn({ method: "POST" })
  .inputValidator(projectIdInputSchema)
  .handler(async ({ data }) => {
    const env = await getEnv();
    const database = makeDatabase(env[templarBindings.db], { schema });
    const queue = makeQueue(env[templarBindings.jobsQueue]);
    const cache = makeCache(env[templarBindings.cache]);
    const jobId = crypto.randomUUID();
    const now = new Date();

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () =>
            database.db.insert(launchAnalysisJobs).values({
              id: jobId,
              projectId: data.projectId,
              status: "queued",
              message: "Deep analysis queued.",
              queuedAt: now,
            }),
          catch: (cause) =>
            databaseError({
              operation: "insert",
              table: "launch_analysis_jobs",
              cause,
            }),
        });

        yield* Effect.tryPromise({
          try: () =>
            database.db
              .update(launchProjects)
              .set({
                status: "analyzing",
                updatedAt: now,
              })
              .where(eq(launchProjects.id, data.projectId)),
          catch: (cause) =>
            databaseError({
              operation: "update",
              table: "launch_projects",
              cause,
            }),
        });

        yield* queue.send({
          body: {
            id: jobId,
            projectId: data.projectId,
          } satisfies AnalysisQueueJob,
          metadata: {
            kind: "launch-room-deep-analysis",
          },
        });

        yield* writeEvent(
          database,
          data.projectId,
          "analytics.deep_analysis_queued",
          "Deep analysis queued.",
        );
        yield* cache.delete(dashboardCacheKey);
      }),
    );

    return await Effect.runPromise(readDashboard(database));
  });

const markProjectShipped = createServerFn({ method: "POST" })
  .inputValidator(projectIdInputSchema)
  .handler(async ({ data }) => {
    const env = await getEnv();
    const database = makeDatabase(env[templarBindings.db], { schema });
    const cache = makeCache(env[templarBindings.cache]);
    const now = new Date();

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () =>
            database.db
              .update(launchProjects)
              .set({
                status: "shipped",
                updatedAt: now,
              })
              .where(eq(launchProjects.id, data.projectId)),
          catch: (cause) =>
            databaseError({
              operation: "update",
              table: "launch_projects",
              cause,
            }),
        });

        yield* writeEvent(
          database,
          data.projectId,
          "analytics.project_shipped",
          "Project marked shipped.",
        );
        yield* cache.delete(dashboardCacheKey);
      }),
    );

    return await Effect.runPromise(readDashboard(database));
  });

async function getEnv() {
  const { env } = await import("cloudflare:workers");

  return env as AppEnv;
}

function readDashboard(database: LaunchDatabase) {
  return Effect.gen(function* () {
    const [projects, reports, artifacts, jobs, events] = yield* Effect.tryPromise({
      try: async () => {
        return await Promise.all([
          database.db
            .select()
            .from(launchProjects)
            .orderBy(desc(launchProjects.updatedAt))
            .limit(12),
          database.db.select().from(launchReports).orderBy(desc(launchReports.createdAt)).limit(24),
          database.db
            .select()
            .from(launchArtifacts)
            .orderBy(desc(launchArtifacts.createdAt))
            .limit(24),
          database.db
            .select()
            .from(launchAnalysisJobs)
            .orderBy(desc(launchAnalysisJobs.queuedAt))
            .limit(12),
          database.db.select().from(launchEvents).orderBy(desc(launchEvents.id)).limit(30),
        ]);
      },
      catch: (cause) =>
        databaseError({
          operation: "select",
          table: "launch_dashboard",
          cause,
        }),
    });

    return {
      projects: projects.map(serializeProject),
      reports: reports.map(serializeReport),
      artifacts: artifacts.map(serializeArtifact),
      jobs: jobs.map(serializeJob),
      events: events.map(serializeEvent),
      cache: {
        key: dashboardCacheKey,
        generatedAt: new Date().toISOString(),
      },
    } satisfies DashboardData;
  });
}

function writeReport(
  database: LaunchDatabase,
  blob: ReturnType<typeof makeBlob>,
  projectId: string,
  kind: "first_pass" | "deep_analysis",
  report: GeneratedLaunchReport,
  createdAt: Date,
) {
  return Effect.gen(function* () {
    const reportId = crypto.randomUUID();
    const reportBlobKey = `projects/${projectId}/reports/${reportId}.json`;

    yield* blob.put({
      key: reportBlobKey,
      body: JSON.stringify(report, null, 2),
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
      },
      metadata: {
        projectId,
        kind,
      },
    });

    yield* Effect.tryPromise({
      try: () =>
        database.db.insert(launchReports).values({
          id: reportId,
          projectId,
          kind,
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
          name: kind === "first_pass" ? "First-pass report" : "Deep analysis report",
          kind: "generated",
          blobKey: reportBlobKey,
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

type GeneratedLaunchReport = z.output<typeof launchReportSchema> & {
  readonly model: string;
  readonly provider: string;
};

async function generateLaunchReport(input: {
  readonly env: AppEnv;
  readonly project: Pick<LaunchProject, "name" | "audience" | "problem" | "distribution">;
  readonly contextNotes: readonly string[];
  readonly kind: "first_pass" | "deep_analysis";
}): Promise<GeneratedLaunchReport> {
  const apiKey = input.env[templarBindings.openRouterApiKey];

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return heuristicLaunchReport(input.project, input.contextNotes, input.kind);
  }

  try {
    const ai = makeAI({
      apiKey,
      appName: "Launch Room",
      siteUrl: "https://launch-room.ericventor.com",
    });
    const result = await Effect.runPromise(
      ai.generateObject({
        model: input.kind === "deep_analysis" ? "reasoning" : "balanced",
        temperature: 0.4,
        maxTokens: 1400,
        schema: launchReportSchema,
        messages: [
          {
            role: "system",
            content:
              "You are a concise startup launch strategist. Return practical, concrete product strategy for a solo builder. Avoid generic advice.",
          },
          {
            role: "user",
            content: [
              `Project: ${input.project.name}`,
              `Audience: ${input.project.audience}`,
              `Problem: ${input.project.problem}`,
              `Distribution: ${input.project.distribution}`,
              `Analysis type: ${input.kind}`,
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
    return heuristicLaunchReport(input.project, input.contextNotes, input.kind);
  }
}

function heuristicLaunchReport(
  project: Pick<LaunchProject, "name" | "audience" | "problem" | "distribution">,
  contextNotes: readonly string[],
  kind: "first_pass" | "deep_analysis",
): GeneratedLaunchReport {
  const contextSummary =
    contextNotes.length === 0
      ? "No outside context has been attached yet."
      : `${contextNotes.length} context note(s) were attached.`;

  return {
    summary: `${project.name} should start as a narrow workflow for ${project.audience}. The strongest wedge is solving "${project.problem}" with a visible output that can be shared through ${project.distribution}. ${contextSummary}`,
    mvpScope:
      kind === "first_pass"
        ? "Ship one guided intake, one generated launch brief, one saved context area, and one exportable launch checklist."
        : "Tighten the MVP around one repeatable user outcome, add one proof artifact per project, and make every report produce a next action that can be completed in under 30 minutes.",
    risks: [
      "The audience may still be too broad for a crisp first launch.",
      "The product could become a generic AI workspace unless the output format is opinionated.",
      "Distribution needs a repeatable channel, not just a launch announcement.",
      "The MVP should avoid multi-user collaboration until one-user value is proven.",
    ],
    launchPlan: [
      "Write a one-sentence promise for the narrowest audience segment.",
      "Create three example projects that demonstrate the before and after.",
      "Publish a build log showing the generated brief and checklist.",
      "Ask five target users to run one idea through the workflow.",
      "Cut features that do not improve the first generated launch plan.",
    ],
    socialPosts: [
      `I built ${project.name} to turn a messy idea into a launch plan instead of another notes graveyard.`,
      `The useful AI pattern here is not chat. It is intake -> structured report -> queued deep analysis -> launch checklist.`,
    ],
    model: "local-heuristic",
    provider: "fallback",
  };
}

function serializeProject(row: typeof launchProjects.$inferSelect): LaunchProject {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeReport(row: typeof launchReports.$inferSelect): LaunchReport {
  return {
    ...row,
    risks: row.risks,
    launchPlan: row.launchPlan,
    socialPosts: row.socialPosts,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeArtifact(row: typeof launchArtifacts.$inferSelect): LaunchArtifact {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeJob(row: typeof launchAnalysisJobs.$inferSelect): LaunchJob {
  return {
    ...row,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function serializeEvent(row: typeof launchEvents.$inferSelect): LaunchEvent {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function Home() {
  const initialDashboard = Route.useLoaderData();
  const session = authClient.useSession();
  const createProjectFn = useServerFn(createProject);
  const addContextNoteFn = useServerFn(addContextNote);
  const enqueueDeepAnalysisFn = useServerFn(enqueueDeepAnalysis);
  const markProjectShippedFn = useServerFn(markProjectShipped);
  const getDashboardFn = useServerFn(getDashboard);
  const nameId = useId();
  const audienceId = useId();
  const problemId = useId();
  const distributionId = useId();
  const noteNameId = useId();
  const noteBodyId = useId();
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialDashboard.projects[0]?.id ?? "",
  );
  const [name, setName] = useState("Proof Sprint");
  const [audience, setAudience] = useState("solo builders validating small software products");
  const [problem, setProblem] = useState(
    "they keep building before the launch angle is specific enough",
  );
  const [distribution, setDistribution] = useState("build-in-public posts and direct outreach");
  const [noteName, setNoteName] = useState("Competitor notes");
  const [noteBody, setNoteBody] = useState(
    "Most tools feel like blank AI chat. The product should force concrete launch artifacts.",
  );
  const [authEmail, setAuthEmail] = useState("launch@example.com");
  const [authPassword, setAuthPassword] = useState("password123");
  const [authName, setAuthName] = useState("Launch Operator");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAuthPending, startAuthTransition] = useTransition();
  const currentUser = session.data?.user ?? null;
  const selectedProject =
    dashboard.projects.find((project) => project.id === selectedProjectId) ?? dashboard.projects[0];
  const selectedReport = selectedProject
    ? dashboard.reports.find((report) => report.projectId === selectedProject.id)
    : undefined;
  const selectedArtifacts = selectedProject
    ? dashboard.artifacts.filter((artifact) => artifact.projectId === selectedProject.id)
    : [];
  const selectedJobs = selectedProject
    ? dashboard.jobs.filter((job) => job.projectId === selectedProject.id)
    : [];
  const selectedEvents = selectedProject
    ? dashboard.events.filter((event) => event.projectId === selectedProject.id)
    : dashboard.events;
  const readyCount = dashboard.projects.filter(
    (project) => project.status === "ready" || project.status === "shipped",
  ).length;
  const progressValue =
    dashboard.projects.length === 0
      ? 0
      : Math.round((readyCount / dashboard.projects.length) * 100);

  const updateDashboard = (nextDashboard: DashboardData) => {
    setDashboard(nextDashboard);
    setSelectedProjectId((current) => {
      if (nextDashboard.projects.some((project) => project.id === current)) {
        return current;
      }

      return nextDashboard.projects[0]?.id ?? "";
    });
  };

  const handleAuthSubmit = () => {
    setError(null);
    startAuthTransition(async () => {
      const result =
        authMode === "sign-up"
          ? await authClient.signUp.email({
              name: authName,
              email: authEmail,
              password: authPassword,
            })
          : await authClient.signIn.email({
              email: authEmail,
              password: authPassword,
            });

      if (result.error !== null) {
        setError(result.error.message ?? "Authentication failed.");
        return;
      }

      await session.refetch();
    });
  };

  const handleCreateProject = () => {
    setError(null);
    startTransition(async () => {
      try {
        const nextDashboard = await createProjectFn({
          data: {
            name,
            audience,
            problem,
            distribution,
          },
        });
        updateDashboard(nextDashboard);
      } catch {
        setError("The idea could not be created.");
      }
    });
  };

  const handleAddNote = () => {
    if (selectedProject === undefined) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const nextDashboard = await addContextNoteFn({
          data: {
            projectId: selectedProject.id,
            name: noteName,
            body: noteBody,
          },
        });
        updateDashboard(nextDashboard);
      } catch {
        setError("The context note could not be saved.");
      }
    });
  };

  const handleDeepAnalysis = () => {
    if (selectedProject === undefined) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const nextDashboard = await enqueueDeepAnalysisFn({
          data: {
            projectId: selectedProject.id,
          },
        });
        updateDashboard(nextDashboard);

        for (let attempt = 0; attempt < 12; attempt += 1) {
          await wait(1000);
          const refreshed = await getDashboardFn();
          updateDashboard(refreshed);

          const latestJob = refreshed.jobs.find((job) => job.projectId === selectedProject.id);

          if (latestJob?.status === "completed" || latestJob?.status === "failed") {
            return;
          }
        }
      } catch {
        setError("Deep analysis could not be queued.");
      }
    });
  };

  const handleMarkShipped = () => {
    if (selectedProject === undefined) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        updateDashboard(
          await markProjectShippedFn({
            data: {
              projectId: selectedProject.id,
            },
          }),
        );
      } catch {
        setError("The project could not be marked shipped.");
      }
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Launch Room</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">
              Turn rough ideas into launch plans.
            </h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace</CardTitle>
              <CardDescription>
                {currentUser === null ? "Sign in to make the room yours." : currentUser.email}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {authMode === "sign-up" ? (
                <Input
                  value={authName}
                  onChange={(event) => setAuthName(event.currentTarget.value)}
                />
              ) : null}
              <Input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.currentTarget.value)}
                type="email"
              />
              <Input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.currentTarget.value)}
                type="password"
              />
            </CardContent>
            <CardFooter className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={isAuthPending} onClick={handleAuthSubmit} type="button">
                  {authMode === "sign-up" ? "Sign up" : "Sign in"}
                </Button>
                <Button
                  disabled={isAuthPending}
                  onClick={() => setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in")}
                  type="button"
                  variant="outline"
                >
                  {authMode === "sign-in" ? "New" : "Existing"}
                </Button>
              </div>
              <Button
                disabled={currentUser === null || isAuthPending}
                onClick={async () => {
                  await authClient.signOut();
                  await session.refetch();
                }}
                type="button"
                variant="ghost"
              >
                Sign out
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
              <CardDescription>{dashboard.projects.length} ideas in flight</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {dashboard.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create the first idea to open the room.
                </p>
              ) : (
                dashboard.projects.map((project) => (
                  <button
                    className="rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted data-[active=true]:border-primary data-[active=true]:bg-primary/5"
                    data-active={project.id === selectedProject?.id}
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    type="button"
                  >
                    <span className="block font-medium">{project.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {project.status}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-6">
          {error === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard
              icon={<LightbulbIcon />}
              label="Ideas"
              value={String(dashboard.projects.length)}
            />
            <MetricCard
              icon={<ClipboardListIcon />}
              label="Reports"
              value={String(dashboard.reports.length)}
            />
            <MetricCard icon={<CheckCircle2Icon />} label="Ready" value={`${progressValue}%`} />
            <MetricCard
              icon={<RocketIcon />}
              label="Artifacts"
              value={String(dashboard.artifacts.length)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Card>
              <CardHeader>
                <CardTitle>New Idea</CardTitle>
                <CardDescription>Capture the smallest version worth validating.</CardDescription>
                <CardAction>
                  <Badge variant="secondary">AI first pass</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={nameId}>Name</Label>
                  <Input
                    id={nameId}
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={audienceId}>Audience</Label>
                  <Input
                    id={audienceId}
                    value={audience}
                    onChange={(event) => setAudience(event.currentTarget.value)}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor={problemId}>Pain</Label>
                  <Textarea
                    id={problemId}
                    value={problem}
                    onChange={(event) => setProblem(event.currentTarget.value)}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor={distributionId}>Distribution</Label>
                  <Textarea
                    id={distributionId}
                    value={distribution}
                    onChange={(event) => setDistribution(event.currentTarget.value)}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button disabled={isPending} onClick={handleCreateProject} type="button">
                  {isPending ? "Working..." : "Create launch brief"}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Readiness</CardTitle>
                <CardDescription>How much of the room has a launchable plan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={progressValue} />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Cache</p>
                    <p className="mt-1 font-medium">
                      {new Date(dashboard.cache.generatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Queue</p>
                    <p className="mt-1 font-medium">{dashboard.jobs[0]?.status ?? "idle"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {selectedProject === undefined ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No project selected.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="space-y-1">
                  <CardTitle>{selectedProject.name}</CardTitle>
                  <CardDescription>{selectedProject.problem}</CardDescription>
                </div>
                <CardAction>
                  <Badge>{selectedProject.status}</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="brief">
                  <TabsList>
                    <TabsTrigger value="brief">Brief</TabsTrigger>
                    <TabsTrigger value="context">Context</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="content">Content</TabsTrigger>
                  </TabsList>

                  <TabsContent className="pt-4" value="brief">
                    {selectedReport === undefined ? (
                      <p className="text-sm text-muted-foreground">No report generated yet.</p>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                        <div className="space-y-4">
                          <ReportBlock title="Summary" body={selectedReport.summary} />
                          <ReportBlock title="MVP Scope" body={selectedReport.mvpScope} />
                        </div>
                        <div className="space-y-4">
                          <ListBlock title="Risks" items={selectedReport.risks} />
                          <ListBlock title="Launch Plan" items={selectedReport.launchPlan} />
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent className="pt-4" value="context">
                    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                      <div className="grid gap-3">
                        <Label htmlFor={noteNameId}>Note name</Label>
                        <Input
                          id={noteNameId}
                          value={noteName}
                          onChange={(event) => setNoteName(event.currentTarget.value)}
                        />
                        <Label htmlFor={noteBodyId}>Context</Label>
                        <Textarea
                          id={noteBodyId}
                          value={noteBody}
                          onChange={(event) => setNoteBody(event.currentTarget.value)}
                        />
                        <Button disabled={isPending} onClick={handleAddNote} type="button">
                          Save context
                        </Button>
                      </div>
                      <div className="rounded-lg border">
                        {selectedArtifacts.length === 0 ? (
                          <p className="p-4 text-sm text-muted-foreground">No context saved yet.</p>
                        ) : (
                          selectedArtifacts.map((artifact) => (
                            <div className="border-b p-4 last:border-b-0" key={artifact.id}>
                              <p className="font-medium">{artifact.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {artifact.kind} · {artifact.blobKey}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent className="pt-4" value="timeline">
                    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
                      <div className="space-y-3">
                        <Button disabled={isPending} onClick={handleDeepAnalysis} type="button">
                          Run deep analysis
                        </Button>
                        <Button
                          disabled={isPending}
                          onClick={handleMarkShipped}
                          type="button"
                          variant="outline"
                        >
                          Mark shipped
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {[...selectedJobs, ...selectedEvents].length === 0 ? (
                          <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
                        ) : null}
                        {selectedJobs.map((job) => (
                          <TimelineRow
                            key={job.id}
                            label={job.status}
                            message={job.message}
                            at={job.completedAt ?? job.startedAt ?? job.queuedAt}
                          />
                        ))}
                        {selectedEvents.map((event) => (
                          <TimelineRow
                            key={event.id}
                            label={event.type}
                            message={event.message}
                            at={event.createdAt}
                          />
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent className="pt-4" value="content">
                    <ListBlock title="Social Drafts" items={selectedReport?.socialPosts ?? []} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportBlock({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function ListBlock({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="font-medium">{title}</p>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing generated yet.</p>
        ) : (
          items.map((item) => (
            <div className="flex gap-3 text-sm" key={item}>
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <p className="leading-6 text-muted-foreground">{item}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  message,
  at,
}: {
  readonly label: string;
  readonly message: string;
  readonly at: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline">{label}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(at).toLocaleTimeString()}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
