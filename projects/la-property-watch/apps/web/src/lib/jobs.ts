import { makeQueue } from "@templar/queue";
import { Effect } from "effect";
import type { Bindings } from "./auth.server.ts";
import type { IngestionTrigger } from "./model.ts";
import { failRefreshJob, requestRefreshJob } from "./repository.ts";

export type RefreshQueueJob = {
  readonly jobId: string;
  readonly trigger: IngestionTrigger;
};

export async function enqueueRefresh(bindings: Bindings, trigger: IngestionTrigger) {
  const requested = await requestRefreshJob(bindings.DB, trigger);
  if (!requested.created) {
    return requested;
  }
  try {
    const queue = makeQueue<RefreshQueueJob>(bindings.JOBS);
    await Effect.runPromise(queue.send({ body: { jobId: requested.job.id, trigger } }));
    return requested;
  } catch (cause) {
    await failRefreshJob(bindings.DB, requested.job.id, cause);
    throw cause;
  }
}
