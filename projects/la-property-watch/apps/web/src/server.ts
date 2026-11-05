import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { makeQueue } from "@templar/queue";
import { makeScheduler } from "@templar/scheduler";
import { Effect } from "effect";
import type { Bindings } from "./lib/auth.server.ts";
import { enqueueRefresh, type RefreshQueueJob } from "./lib/jobs.ts";
import { runRefreshJob } from "./lib/repository.ts";
import { schedules } from "./schedules.ts";

const handle = createStartHandler(defaultStreamHandler);

export default {
  async fetch(request: Request) {
    const response = await handle(request);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "same-origin");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    return response;
  },
  async scheduled(controller: ScheduledController, env: Bindings) {
    const scheduler = makeScheduler(schedules, {
      dailyResearchRefresh: () =>
        Effect.tryPromise({
          try: () => enqueueRefresh(env, "scheduled").then(() => undefined),
          catch: (cause) =>
            cause instanceof Error ? cause : new Error("Could not queue refresh."),
        }),
    });
    await Effect.runPromise(scheduler.handle(controller));
  },
  async queue(batch: MessageBatch<string>, env: Bindings) {
    const queue = makeQueue<RefreshQueueJob>(env.JOBS);
    await Effect.runPromise(
      queue.consume(batch.messages, (message) =>
        Effect.tryPromise({
          try: () =>
            runRefreshJob(env.DB, message.body.jobId, message.body.trigger).then(() => undefined),
          catch: (cause) => (cause instanceof Error ? cause : new Error("Queued refresh failed.")),
        }),
      ),
    );
  },
};
