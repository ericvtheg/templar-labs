import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { databaseError, makeDatabase } from "@templar/db";
import { cloudflareQueueMessage, makeQueue } from "@templar/queue";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import * as schema from "../../../db/schema.ts";
import { queueEvents } from "../../../db/schema.ts";
import { templarBindings } from "../../../templar-bindings.ts";

type QueueJob = {
  readonly id: string;
  readonly message: string;
  readonly publishedAt: string;
};

type Env = {
  readonly [templarBindings.db]: D1Database;
  readonly [templarBindings.jobsQueue]: Queue<string>;
};

const fetch = createStartHandler(defaultStreamHandler);

export default {
  fetch,
  async queue(batch: MessageBatch<string>, env: Env) {
    const database = makeDatabase(env[templarBindings.db], { schema });
    const queue = makeQueue(env[templarBindings.jobsQueue]);

    await Effect.runPromise(
      Effect.forEach(batch.messages, (message) =>
        Effect.gen(function* () {
          const stored = cloudflareQueueMessage(message);
          const job = yield* queue.deserialize<QueueJob>(stored);
          const processedAt = new Date();

          yield* Effect.tryPromise({
            try: () =>
              database.db
                .update(queueEvents)
                .set({
                  message: `Processed: ${job.body.message}`,
                  status: "processed",
                  processedAt,
                })
                .where(eq(queueEvents.messageId, job.body.id)),
            catch: (cause) =>
              databaseError({
                operation: "update",
                table: "queue_events",
                cause,
              }),
          });

          yield* queue.ack(stored);
        }),
      ),
    );
  },
};
