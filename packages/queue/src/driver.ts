import { Effect } from "effect";
import { QueueStorageError, type QueueStorageOperation } from "./errors.ts";
import type {
  QueueDriverSendInput,
  QueueRetryOptions,
  QueueSendBatchResult,
  QueueSendResult,
  QueueStoredMessage,
} from "./types.ts";

export type QueueDriver = {
  readonly send: (input: QueueDriverSendInput) => Effect.Effect<QueueSendResult, QueueStorageError>;
  readonly sendBatch: (
    inputs: ReadonlyArray<QueueDriverSendInput>,
  ) => Effect.Effect<QueueSendBatchResult, QueueStorageError>;
  readonly ack: (message: QueueStoredMessage) => Effect.Effect<void, QueueStorageError>;
  readonly retry: (
    message: QueueStoredMessage,
    options?: QueueRetryOptions,
  ) => Effect.Effect<void, QueueStorageError>;
};

export function tryQueueStoragePromise<A>(input: {
  readonly operation: QueueStorageOperation;
  readonly messageId?: string;
  readonly try: () => PromiseLike<A>;
}): Effect.Effect<A, QueueStorageError> {
  return Effect.tryPromise({
    try: input.try,
    catch: (cause) =>
      new QueueStorageError({
        operation: input.operation,
        messageId: input.messageId,
        cause,
      }),
  });
}

export function tryQueueStorage<A>(input: {
  readonly operation: QueueStorageOperation;
  readonly messageId?: string;
  readonly try: () => A;
}): Effect.Effect<A, QueueStorageError> {
  return Effect.try({
    try: input.try,
    catch: (cause) =>
      new QueueStorageError({
        operation: input.operation,
        messageId: input.messageId,
        cause,
      }),
  });
}
