import { Effect } from "effect";
import { type QueueOperation, QueueSerializationError } from "./errors.ts";

export type QueueLoggingInput = {
  readonly provider: string;
  readonly operation: QueueOperation;
  readonly messageId?: string;
  readonly messageCount?: number;
};

export function withQueueLogging(input: QueueLoggingInput) {
  return <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    self.pipe(
      Effect.tap(() => Effect.logDebug("queue operation completed")),
      Effect.tapError((error) =>
        error instanceof QueueSerializationError
          ? Effect.logDebug("queue serialization failed", error)
          : Effect.logError("queue operation failed", error),
      ),
      Effect.annotateLogs(queueLogAnnotations(input)),
      Effect.withLogSpan(`queue.${input.operation}`),
    );
}

function queueLogAnnotations(input: QueueLoggingInput): Record<string, unknown> {
  return {
    package: "@templar/queue",
    provider: input.provider,
    operation: input.operation,
    ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
    ...(input.messageCount === undefined ? {} : { messageCount: input.messageCount }),
  };
}
