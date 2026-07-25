import { Data } from "effect";

export type QueueProviderOperation = "send" | "sendBatch";
export type QueueSerializationOperation = "serialize" | "deserialize";
export type QueueOperation = QueueProviderOperation | QueueSerializationOperation | "consume";

export class QueueProviderError extends Data.TaggedError("QueueProviderError")<{
  readonly provider: string;
  readonly operation: QueueProviderOperation;
  readonly messageId: string | undefined;
  readonly cause: unknown;
}> {}

export class QueueSerializationError extends Data.TaggedError("QueueSerializationError")<{
  readonly operation: QueueSerializationOperation;
  readonly messageId: string | undefined;
  readonly cause: unknown;
}> {}

export type QueueError = QueueProviderError | QueueSerializationError;
