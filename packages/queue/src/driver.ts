import { Effect } from "effect";
import { QueueProviderError, type QueueProviderOperation } from "./errors.ts";
import type { QueueDriverSendInput } from "./types.ts";

export type QueueDriver = {
  readonly send: (input: QueueDriverSendInput) => Effect.Effect<void, QueueProviderError>;
  readonly sendBatch: (
    inputs: ReadonlyArray<QueueDriverSendInput>,
  ) => Effect.Effect<void, QueueProviderError>;
};

export function tryQueueProviderPromise<A>(input: {
  readonly provider: string;
  readonly operation: QueueProviderOperation;
  readonly messageId?: string;
  readonly try: () => PromiseLike<A>;
}): Effect.Effect<A, QueueProviderError> {
  return Effect.tryPromise({
    try: input.try,
    catch: (cause) =>
      new QueueProviderError({
        provider: input.provider,
        operation: input.operation,
        messageId: input.messageId,
        cause,
      }),
  });
}
